document.observe("dom:loaded", function()
{
	// If we have no configuration, do not do anything
	if (typeof PCNLAPI_CONFIG == 'undefined')
		return;

	if (typeof String.prototype.trim !== 'function')
	{
		String.prototype.trim = function()
		{
			return this.replace(/^\s+|\s+$/g, '');
		}
	}

	function pcnlFireEvent(element,event){
	    if (document.createEventObject){
	        // dispatch for IE
	        var evt = document.createEventObject();
	        return element.fireEvent('on'+event,evt)
	    }
	    else{
	        // dispatch for firefox + others
	        var evt = document.createEvent("HTMLEvents");
	        evt.initEvent(event, true, true ); // event type,bubbling,cancelable
	        return !element.dispatchEvent(evt);
	    }
	}

	var PostcodeNl_Api = {
		/**
		 * Cache requests to improve multiple identical requests (billing / shipping, etc)
		 */
		requestCache: {},

		/*
		 * Regular expressions for matching address parts
		 */
		REGEXP_STREET: '[^0-9].*?|.*?[^0-9]',
		REGEXP_HOUSENUMBER: '[0-9]+',
		REGEXP_HOUSENUMBER_ADDITION: '[^\\s]+|[^\\s]\\s+[^\\s]{1,4}',

		/*
		 * The 'item' parent element signature in the address form
		 */
		parentElementType: 'li',

		/**
		 * Hide multiple field-rows in forms
		 */
		hideFields: function (fields)
		{
			var pcnl = this;
			fields.each(function (fieldId)
			{
				if ($(fieldId) && $(fieldId).up(pcnl.parentElementType))
				{
					$(fieldId).up(pcnl.parentElementType).addClassName('pcnl-hidden-field')
				}
			});
		},

		/**
		 * Un-hide multiple field-rows in forms
		 */
		showFields: function (fields)
		{
			var pcnl = this;
			fields.each(function (fieldId)
			{
				if ($(fieldId) && $(fieldId).up(pcnl.parentElementType))
				{
					$(fieldId).up(pcnl.parentElementType).removeClassName('pcnl-hidden-field')
				}
			});
		},

		/**
		 * Remove all validation messages
		 */
		removeValidationMessages: function (prefix)
		{
			var advice = Validation.getAdvice('invalid-postcode', $(prefix +'postcode_housenumber'));
			if (advice)
			{
				Validation.hideAdvice($(prefix +'postcode_housenumber'), advice, 'invalid-postcode');
			}
			var advice = Validation.getAdvice('invalid-postcode', $(prefix +'postcode_input'));
			if (advice)
			{
				Validation.hideAdvice($(prefix +'postcode_input'), advice, 'invalid-postcode');
			}
			if ($(prefix +'postcode_housenumber_addition'))
			{
				var additionAdvice = Validation.getAdvice('invalid-addition', $(prefix +'postcode_housenumber_addition'));
				if (additionAdvice)
				{
					Validation.hideAdvice($(prefix +'postcode_housenumber_addition'), additionAdvice, 'invalid-addition');
				}
			}
		},

		/**
		 * Remove housenumber addition selectbox, and any related elements / classes.
		 */
		removeHousenumberAddition: function (prefix)
		{
			if ($(prefix +'postcode_housenumber_addition'))
			{
				Element.remove($(prefix +'postcode_housenumber_addition'));
				if ($(prefix +'postcode_housenumber_addition:wrapper'))
				{
					Element.remove($(prefix +'postcode_housenumber_addition:wrapper'));
				}
				if ($(prefix + 'postcode_housenumber').up(this.parentElementType))
				{
					$(prefix + 'postcode_housenumber').up(this.parentElementType).removeClassName('pcnl-with-addition');
				}
			}
		},

		/**
		 * Get HTML format for info. (used in Showcode / Debug)
		 */
		getFieldListHtml: function (data, className)
		{
			var toType = function(obj) {
				return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase();
			}

			var html = '';
			if (toType(data) == 'object' ) {

				if (className) {
					html = '<dl class="'+ String(className).escapeHTML() +'">';
				} else {
					html = '<dl>';
				}

				for (var prop in data)
				{
					var name = prop.charAt(0).toUpperCase() + prop.slice(1);
					if (prop == 'modules') {
						html += '<dt>'+ name.escapeHTML() +'</dt><dd>';
						for (var moduleName in data[prop]) {
							html += String(moduleName +'-'+ data[prop][moduleName].codePool + (data[prop][moduleName].version !== undefined ? '-' + data[prop][moduleName].version : '') + (data[prop][moduleName].active ? '' : ' (inactive)')).escapeHTML() +'<br />';
						}
						html += '</dd>';
					}
					else {
						html += '<dt>'+ name.escapeHTML() +'</dt><dd>'+ this.getFieldListHtml(data[prop]) +'</dd>';
					}
				}
				html += '</dl>';
			} else {
				html = String(data === null ? '- none -' : data).escapeHTML();
			}
			return html;
		},


		/**
		 * Toggle 'readonly' on multiple fields. Sets class, attribute.
		 */
		setFieldsReadonly: function (fields, readonly)
		{
			fields.each(function (fieldId)
			{
				if ($(fieldId))
				{
					if (readonly)
					{
						if ($(fieldId).nodeName == 'SELECT')
						{
							$(fieldId).disabled = true;
						}
						else
						{
							$(fieldId).setAttribute('readonly', true);
						}
						$(fieldId).addClassName('pcnl-readonly');
						if ($(fieldId).hasClassName('required-entry'))
						{
							$(fieldId).removeClassName('required-entry');
							$(fieldId).addClassName('pcnl-disabled-required-entry');
						}
					}
					else
					{
						if ($(fieldId).nodeName == 'SELECT')
						{
							$(fieldId).disabled = false;
						}
						else
						{
							$(fieldId).removeAttribute('readonly');
						}
						$(fieldId).removeClassName('pcnl-readonly');
						if ($(fieldId).hasClassName('pcnl-disabled-required-entry'))
						{
							$(fieldId).addClassName('required-entry');
							$(fieldId).removeClassName('pcnl-disabled-required-entry');
						}
					}
				}
			});
		},

		/**
		 * Look up the address for a form, validate & enrich target form.
		 */
		lookupPostcode: function (prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4, event)
		{
			var pcnlapi = this;
			if (!$(prefix + 'postcode_housenumber'))
			{
				return;
			}

			var postcode = $(prefix + 'postcode_input').getValue();

			postcode = postcode.replace(/\s+/, '');

			var housenumber_mixed = $(prefix + 'postcode_housenumber').getValue().trim();
			// Number, followed by non alphanumberic chars, and then additional number ("123 A", "123-rood", etc)
			// or: Number, followed directly by a letter and then alphanumeric/space charcters ("123b3", "123berk 23", etc)
			var housenumber_match = housenumber_mixed.match('^('+ this.REGEXP_HOUSENUMBER +')([^0-9a-zA-Z]*('+ this.REGEXP_HOUSENUMBER_ADDITION +'))?\\s*$');

			var housenumber_addition_select = $(prefix +'postcode_housenumber_addition') ? $(prefix +'postcode_housenumber_addition').getValue() : null;

			var housenumber = housenumber_match ? housenumber_match[1].trim() : housenumber_mixed;

			var housenumber_addition = '';

			if (!housenumber_match)
				housenumber_addition = '';
			else if (housenumber_match[3] !== undefined)
				housenumber_addition = housenumber_match[3].trim();

			if (housenumber_addition == '' && housenumber_addition_select != '__none__' && housenumber_addition_select != '__select__' && housenumber_addition_select != null)
				housenumber_addition = housenumber_addition_select;

			if ($(prefix + countryFieldId).getValue() != 'NL' || postcode == '' || housenumber_mixed == '')
				return;

			// Make uppercase to prevent double, but identical, requests
			postcode = postcode.toUpperCase();

			var url = PCNLAPI_CONFIG.baseUrl +'lookup?postcode=' + postcode + '&houseNumber=' + housenumber + '&houseNumberAddition=' + housenumber_addition;
			if (this.requestCache[url] === undefined)
			{
				new Ajax.Request(url,
				{
					method: 'get',
					onException: function(transport, e)
					{
						throw e;
					},
					onComplete: function(transport)
					{
						var json = transport.responseText.evalJSON();
						if (!PCNLAPI_CONFIG.debug) {
							pcnlapi.requestCache[url] = json;
						}
						pcnlapi.updatePostcodeLookup(json, housenumber_addition, housenumber_addition_select, prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4, event);
					}
				});
			}
			else
			{
				this.updatePostcodeLookup(this.requestCache[url], housenumber_addition, housenumber_addition_select, prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4, event);
			}
		},

		/**
		 * Update the address fields, given the validated data.
		 */
		updatePostcodeLookup: function(data, housenumber_addition, housenumber_addition_select, prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4, event)
		{
			if (PCNLAPI_CONFIG.showcase)
			{
				if ($(prefix +'showcase'))
					$(prefix +'showcase').remove();

				var info = this.getFieldListHtml(data.showcaseResponse, 'pcnl-showcase');

				var map = '';
				if (data.showcaseResponse.longitude && data.showcaseResponse.latitude)
				{
					map = '<iframe frameborder="0" scrolling="no" marginheight="0" marginwidth="0" class="map" src="http://maps.google.com/maps?t=h&amp;q='+ data.showcaseResponse.latitude +','+ data.showcaseResponse.longitude +'+(Location found)&amp;z=19&amp;output=embed&amp;iwloc=near"></iframe>';
				}

				if ($(prefix + street1).up(this.parentElementType))
				{
					if (this.parentElementType == 'li')
					{
						$(prefix + street1).up(this.parentElementType).insert({before: '<li id="' + prefix +'showcase" class="wide"><div class="input-box"><h4 class="pcnl-showcase">'+ PCNLAPI_CONFIG.translations.apiShowcase.escapeHTML() +'</h4>'+ map + info + '</div></li>'});
					}
					else if (this.parentElementType == 'tr')
					{
						// We're probably in the admin
						$(prefix + street1).up(this.parentElementType).insert({before: '<tr id="' + prefix + 'showcase"><td class="label">'+ PCNLAPI_CONFIG.translations.apiShowcase.escapeHTML() +'</label></td><td class="value"><h4 class="pcnl-showcase">'+ PCNLAPI_CONFIG.translations.apiShowcase.escapeHTML() +'</h4>'+ info + '</td></tr>'});
					}
					else
					{
						// Assume 'div' elements
						$(prefix + street1).up(this.parentElementType).insert({before: '<div id="' + prefix + 'showcase"><h4 class="pcnl-showcase">'+ PCNLAPI_CONFIG.translations.apiShowcase.escapeHTML() +'</h4>'+ info + '</div>'});
					}
				}
			}
			if (PCNLAPI_CONFIG.debug)
			{
				if ($(prefix +'debug'))
					$(prefix +'debug').remove();

				var info = this.getFieldListHtml(data.debugInfo, 'pcnl-debug');

				if ($(prefix + street1).up(this.parentElementType))
				{
					if (this.parentElementType == 'li')
					{
						$(prefix + street1).up(this.parentElementType).insert({before: '<li id="' + prefix +'debug" class="wide"><div class="input-box"><h4 class="pcnl-debug">'+ PCNLAPI_CONFIG.translations.apiDebug.escapeHTML() +'</h4>'+ info + '</div></li>'});
					}
					else if (this.parentElementType == 'tr')
					{
						// We're probably in the admin
						$(prefix + street1).up(this.parentElementType).insert({before: '<tr id="' + prefix + 'debug"><td class="label">'+ PCNLAPI_CONFIG.translations.apiDebug.escapeHTML() +'</label></td><td class="value"><h4 class="pcnl-debug">'+ PCNLAPI_CONFIG.translations.apiDebug.escapeHTML() +'</h4>'+ info + '</td></tr>'});
					}
					else
					{
						// Assume 'div' elements
						$(prefix + street1).up(this.parentElementType).insert({before: '<div id="' + prefix +'debug" class="full"><div class="input-box"><h4 class="pcnl-debug">'+ PCNLAPI_CONFIG.translations.apiDebug.escapeHTML() +'</h4>'+ info + '</div></div>'});
					}
				}
			}

			// Remove any existing error messages
			this.removeValidationMessages(prefix);

			if (data.postcode !== undefined)
			{
				// Set data from request on form fields
				var postcodeChange = false;
				if ($(prefix + postcodeFieldId).getValue() != data.postcode)
					postcodeChange = true;
				$(prefix + postcodeFieldId).setValue(data.postcode);
				if (postcodeChange)
					pcnlFireEvent($(prefix + postcodeFieldId), 'change');

				$(prefix + 'postcode_input').setValue(data.postcode);
				if (PCNLAPI_CONFIG.useStreet2AsHouseNumber && $(prefix + street2))
				{
					$(prefix + street1).setValue((data.street).trim());
					$(prefix + street2).setValue((data.houseNumber +' '+ (data.houseNumberAddition ? data.houseNumberAddition : housenumber_addition)).trim());
				}
				else
				{
					$(prefix + street1).setValue((data.street +' '+ data.houseNumber +' '+ (data.houseNumberAddition ? data.houseNumberAddition : housenumber_addition)).trim());
				}
				$(prefix +'city').setValue(data.city);
				if ($(prefix +'region'))
				{
					$(prefix +'region').setValue(data.province);
				}
				$(prefix +'postcode_housenumber').setValue(data.houseNumber);

				// Update address result text block
				if ($(prefix + 'postcode_output'))
				{
					this.showFields([prefix +'postcode_output']);
					$(prefix + 'postcode_output').update((data.street +' '+ data.houseNumber +' '+ (data.houseNumberAddition ? data.houseNumberAddition : housenumber_addition)).trim() + "<br>" + data.postcode + " " + data.city);
				}

				// Handle all housenumber addition possiblities
				if (data.houseNumberAddition == null && (housenumber_addition_select == housenumber_addition || (housenumber_addition_select == '__none__' && housenumber_addition == '')))
				{
					// Selected housenumber addition is not known, and the select dropdown already contains that value

					var additionSelect = this.createPostcodeHouseNumberAddition(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4, data.houseNumberAdditions, housenumber_addition_select);

					// Re-select value if it was selected through the selectbox
					if (event && event.element().id == prefix +'postcode_housenumber_addition')
						additionSelect.setValue(housenumber_addition_select);

					if (additionSelect.getValue() != housenumber_addition_select)
					{
						newAdvice = Validation.createAdvice('invalid-addition', $(prefix +'postcode_housenumber_addition'), false, (housenumber_addition != '' ? PCNLAPI_CONFIG.translations.houseNumberAdditionUnknown.replace('{addition}', housenumber_addition) : PCNLAPI_CONFIG.translations.houseNumberAdditionRequired));
						Validation.showAdvice($(prefix +'postcode_housenumber_addition'), newAdvice, 'invalid-addition');
					}
				}
				else if (data.houseNumberAddition == null)
				{
					// Selected housenumber addition is not known, and the select dropdown does not contain that value

					var additionSelect = this.createPostcodeHouseNumberAddition(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4, data.houseNumberAdditions, housenumber_addition);

					newAdvice = Validation.createAdvice('invalid-addition', $(prefix +'postcode_housenumber_addition'), false, (housenumber_addition != '' ? PCNLAPI_CONFIG.translations.houseNumberAdditionUnknown.replace('{addition}', housenumber_addition) : PCNLAPI_CONFIG.translations.houseNumberAdditionRequired));
					Validation.showAdvice($(prefix +'postcode_housenumber_addition'), newAdvice, 'invalid-addition');
				}
				else if (data.houseNumberAdditions.length > 1 || (data.houseNumberAdditions.length == 1 && data.houseNumberAdditions[0] != ''))
				{
					// Address has multiple housenumber additions
					var additionSelect = this.createPostcodeHouseNumberAddition(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4, data.houseNumberAdditions);
					additionSelect.setValue(data.houseNumberAddition);
				}
				else
				{
					// Address has only one valid addition, and it is the 'no addition' option
					this.removeHousenumberAddition(prefix);
				}
			}
			else if (data.message !== undefined)
			{
				// Address check returned an error

				newAdvice = Validation.createAdvice('invalid-postcode', $(prefix + (data.messageTarget == 'postcode' ? 'postcode_input' : 'postcode_housenumber')), false, data.message);
				Validation.showAdvice($(prefix +'postcode_housenumber'), newAdvice, 'invalid-postcode');

				this.removeHousenumberAddition(prefix);
			}
			else
			{
				// Address check did not return an error or a postcode result (something else wrong)

				newAdvice = Validation.createAdvice('invalid-postcode', $(prefix + (data.messageTarget == 'postcode' ? 'postcode_input' : 'postcode_housenumber')), false, '');
				Validation.showAdvice($(prefix +'postcode_housenumber'), newAdvice, 'invalid-postcode');

				this.removeHousenumberAddition(prefix);
			}

			$(prefix + postcodeFieldId).fire('postcode:updated');

			// Add support for syncing Billing & Shipping
			if (prefix == 'billing:' && $('shipping:' + postcodeFieldId)) {
				// 'shipping' is a global object created on most checkout pages
				if (typeof shipping != 'undefined') {
					if ($('shipping:same_as_billing') && $('shipping:same_as_billing').checked) {
		                shipping.syncWithBilling();
					}
				}
				this.lookupPostcode('shipping:', postcodeFieldId, countryFieldId, street1, street2, street3, street4);
			}
		},

		/**
		 * Toggle country selection for a form. Only when the Netherlands is selected, add address enrichment.
		 */
		toggleCountryPostcode: function (prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4)
		{
			var pcnlapi = this;

			// If we have no country set, change to NL (or forms may get confusing when 'reset')
			if ($(prefix + countryFieldId).getValue() == '')
			{
				$(prefix + countryFieldId).setValue('NL');
				pcnlFireEvent($(prefix + countryFieldId), 'change');
			}

			if ($(prefix + countryFieldId).getValue() == 'NL')
			{
				// The Netherlands is selected - add our own validated inputs.

				if (!$(prefix +'postcode_input:wrapper'))
				{
					if ($$('table.form-list').length > 0 && $(prefix + postcodeFieldId).parentNode.tagName == 'TD')
					{
						// We're probably in the admin, slightly different logic than the frontend checkout forms

						this.parentElementType = 'tr';

						if (PCNLAPI_CONFIG.adminValidationDisabled)
						{
							return;
						}

						$(prefix + street1).up('tr').insert({before: '<tr id="' + prefix + 'postcode_input:wrapper"><td class="label"><label for="' + prefix + 'postcode_input">'+ PCNLAPI_CONFIG.translations.postcodeInputLabel +' <span class="required">*</span></label></td><td class="value"><input type="text" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input" value="" class="input-text required-entry" /></td></tr><tr id="' + prefix + 'postcode_housenumber:wrapper"><td class="label"><label for="' + prefix + 'postcode_housenumber">'+ PCNLAPI_CONFIG.translations.houseNumberLabel +' <span class="required">*</span></label></td><td class="value"><input type="text" title="'+ PCNLAPI_CONFIG.translations.houseNumberTitle +'" name="billing[postcode_housenumber]" id="' + prefix + 'postcode_housenumber" value="" class="input-text pcnl-input-text-half required-entry" /></td></tr>'});
						$(prefix + street1).up('tr').insert({before: '<tr id="' + prefix + 'postcode_input:checkbox"><td class="label"><label for="' + prefix + 'postcode_input_checkbox"> '+ PCNLAPI_CONFIG.translations.manualInputLabel +' <span class="required">*</span></label></td><td class="value"><input type="checkbox" id="' + prefix + 'postcode_input_checkbox" value="" class="checkbox" /><label for="' + prefix + 'postcode_input_checkbox">'+ PCNLAPI_CONFIG.translations.manualInputText +'</label></td></tr>'});
						$(prefix +'postcode_input_checkbox').observe('click', function () { pcnlapi.toggleCountryPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4); });
					}
					else if ($(document.body).hasClassName('onestepcheckout-index-index') && $('onestepcheckout-form'))
					{
						// Support for OneStepCheckout extension

						if (!$(prefix +'postcode_input:info'))
						{
							$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:info" class="clearfix"><div class="input-box"><label class="pcnl-info-label">'+ PCNLAPI_CONFIG.translations.infoLabel +'</label><div class="pcnl-info-text" id="' + prefix + 'postcode_input:info-text">'+ PCNLAPI_CONFIG.translations.infoText +'</div></div></li>'});
						}
						$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:wrapper" class="clearfix"><div class="field input-postcode"><label for="' + prefix + 'postcode_input">'+ PCNLAPI_CONFIG.translations.postcodeInputLabel +'<em class="required">*</em></label><div class="input-box"><input type="text" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input" value="" class="input-text required-entry" /></div></div><div class="field input-postcode pcnl-input-housenumber"><label for="' + prefix + 'postcode_housenumber">'+ PCNLAPI_CONFIG.translations.houseNumberLabel +' <em class="required">*</em></label><div class="input-box"><input type="text" title="'+ PCNLAPI_CONFIG.translations.houseNumberTitle +'" name="billing[postcode_housenumber]" id="' + prefix + 'postcode_housenumber" value="" class="input-text pcnl-input-text-half required-entry" /></div></div></li>'});
						if (!$(prefix +'postcode_input:checkbox'))
						{
							$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:checkbox" class="clearfix"><div class="field"><div class="input-box"><input type="checkbox" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input_checkbox" value="" class="checkbox" /><label for="' + prefix + 'postcode_input_checkbox">'+ PCNLAPI_CONFIG.translations.manualInputText +'</label></div></div></li>'});
							$(prefix +'postcode_input_checkbox').observe('click', function () { pcnlapi.toggleCountryPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4); });
						}
						$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:output" class="pcnl-hidden-field"><div class="input-box"><label>'+ PCNLAPI_CONFIG.translations.outputLabel +'</label><div id="' + prefix + 'postcode_output" class="pcnl-address-text"></div></div></li>'});
					}
					else if ($(document.body).hasClassName('onestepcheckout-index-index') && $('co-form'))
					{
						// Support for Apptha One Step Checkout extension

						if (!$(prefix +'postcode_input:info'))
						{
							$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:info"><div class="input-box"><label class="pcnl-info-label">'+ PCNLAPI_CONFIG.translations.infoLabel +'</label><div class="pcnl-info-text" id="' + prefix + 'postcode_input:info-text">'+ PCNLAPI_CONFIG.translations.infoText +'</div></div></li>'});
						}
						$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:wrapper" class="fields"><div class="pcnl-apptha-fields"><div class="field"><label for="' + prefix + 'postcode_input" class="required">'+ PCNLAPI_CONFIG.translations.postcodeInputLabel +'<em>*</em></label><div class="input-box"><input type="text" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input" value="" class="input-text required-entry" /></div></div>'+
							'<div class="field input-postcode pcnl-input-housenumber"><label for="' + prefix + 'postcode_housenumber" class="required">'+ PCNLAPI_CONFIG.translations.houseNumberLabel +' <em>*</em></label><div class="input-box"><input type="text" title="'+ PCNLAPI_CONFIG.translations.houseNumberTitle +'" name="billing[postcode_housenumber]" id="' + prefix + 'postcode_housenumber" value="" class="input-text pcnl-input-text-half required-entry" /></div></div></div></li>'});
						if (!$(prefix +'postcode_input:checkbox'))
						{
							$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:checkbox" class="pcnl-apptha-checkbox"><div class="field"><div class="input-box"><input type="checkbox" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input_checkbox" value="" class="checkbox" /><label for="' + prefix + 'postcode_input_checkbox">'+ PCNLAPI_CONFIG.translations.manualInputText +'</label></div></div></li>'});
							$(prefix +'postcode_input_checkbox').observe('click', function () { pcnlapi.toggleCountryPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4); });
						}
						$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:output" class="pcnl-hidden-field"><div class="input-box"><label>'+ PCNLAPI_CONFIG.translations.outputLabel +'</label><div id="' + prefix + 'postcode_output" class="pcnl-address-text"></div></div></li>'});
					}
					else if ($(document.body).hasClassName('onestepcheckout-index-index') && $('one-step-checkout-form'))
					{
						// Support for MageStore One Step Checkout extension

						if (!$(prefix +'postcode_input:info'))
						{
							$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:info" class="wide"><label class="pcnl-info-label">'+ PCNLAPI_CONFIG.translations.infoLabel +'</label><div class="pcnl-info-text" id="' + prefix + 'postcode_input:info-text">'+ PCNLAPI_CONFIG.translations.infoText +'</div></li>'});
						}
						$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:wrapper" class="input-box"><div class="input-box input-postcode"><label for="' + prefix + 'postcode_input">'+ PCNLAPI_CONFIG.translations.postcodeInputLabel +' <span class="required">*</span></label><br>'+
							'<input type="text" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input" value="" class="input-text required-entry" /></div>'+
							'<div class="input-box input-postcode pcnl-input-housenumber"><label for="' + prefix + 'postcode_housenumber">'+ PCNLAPI_CONFIG.translations.houseNumberLabel +' <span class="required">*</span></label><br><input type="text" title="'+ PCNLAPI_CONFIG.translations.houseNumberTitle +'" name="billing[postcode_housenumber]" id="' + prefix + 'postcode_housenumber" value="" class="input-text pcnl-input-text-half required-entry" /></div></li>'});

						if (!$(prefix +'postcode_input:checkbox'))
						{
							$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:checkbox" class="clearfix"><div class="input-box"><input type="checkbox" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input_checkbox" value="" class="checkbox" /><label for="' + prefix + 'postcode_input_checkbox">'+ PCNLAPI_CONFIG.translations.manualInputText +'</label></div></li>'});
							$(prefix +'postcode_input_checkbox').observe('click', function () { pcnlapi.toggleCountryPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4); });
						}
						$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:output" class="pcnl-hidden-field"><div class="input-box"><label>'+ PCNLAPI_CONFIG.translations.outputLabel +'</label><div id="' + prefix + 'postcode_output" class="pcnl-address-text"></div></div></li>'});
					}
					else if ($(document.body).hasClassName('gomage-checkout-onepage-index'))
					{
						// Support for GoMage LightCheckout extension

						if (!$(prefix +'postcode_input:info'))
						{
							$(prefix + 'country_id').up('li').insert({before: '<li id="' + prefix + 'postcode_input:info" class="pcnl-info"><div class="input-box"><label class="pcnl-info-label">'+ PCNLAPI_CONFIG.translations.infoLabel +'</label><div class="pcnl-info-text" id="' + prefix + 'postcode_input:info-text">'+ PCNLAPI_CONFIG.translations.infoText +'</div></div></li>'});
						}
						$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:wrapper" class="fields"><div class="field input-postcode"><label for="' + prefix + 'postcode_input" class="required">'+ PCNLAPI_CONFIG.translations.postcodeInputLabel +'<em class="required">*</em></label><div class="input-box"><input type="text" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input" value="" class="input-text required-entry" /></div></div><div class="field input-postcode pcnl-input-housenumber"><label for="' + prefix + 'postcode_housenumber" class="required">'+ PCNLAPI_CONFIG.translations.houseNumberLabel +' <em class="required">*</em></label><div class="input-box"><input type="text" title="'+ PCNLAPI_CONFIG.translations.houseNumberTitle +'" name="billing[postcode_housenumber]" id="' + prefix + 'postcode_housenumber" value="" class="input-text pcnl-input-text-half required-entry" /></div></div></li>'});
						if (!$(prefix +'postcode_input:checkbox'))
						{
							$(prefix + 'country_id').up('li').insert({before: '<li id="' + prefix + 'postcode_input:checkbox" class="pcnl-manual-checkbox"><div class="field"><div class="input-box"><input type="checkbox" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input_checkbox" value="" class="checkbox " /><label for="' + prefix + 'postcode_input_checkbox">'+ PCNLAPI_CONFIG.translations.manualInputText +'</label></div></div></li>'});
							$(prefix + 'postcode_input_checkbox').observe('click', function () { pcnlapi.toggleCountryPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4); });
						}
						$(prefix + 'country_id').up('li').insert({before: '<li id="' + prefix + 'postcode_input:output" class="pcnl-hidden-field"><div class="input-box"><label>'+ PCNLAPI_CONFIG.translations.outputLabel +'</label><div id="' + prefix + 'postcode_output" class="pcnl-address-text"></div></div></li>'});
					}
					else if ($(document.body).hasClassName('checkout-onestep-index') && $('easycheckout-login-form'))
					{
						// GrafischDirect One Step Checkout

						this.parentElementType = 'div.line';

						if (!$(prefix +'postcode_input:info'))
						{
							$(prefix + street1).up('div.line').insert({before: '<div id="' + prefix + 'postcode_input:info" class="pcnl-info line"><div class="input-box"><label class="pcnl-info-label">'+ PCNLAPI_CONFIG.translations.infoLabel +'</label><div class="pcnl-info-text" id="' + prefix + 'postcode_input:info-text">'+ PCNLAPI_CONFIG.translations.infoText +'</div></div></div>'});
						}
						$(prefix + street1).up('div.line').insert({before: '<div id="' + prefix + 'postcode_input:wrapper" class="line"><div class="input-postcode left"><label for="' + prefix + 'postcode_input" class="required">'+ PCNLAPI_CONFIG.translations.postcodeInputLabel +'<span class="required">*</span></label><div class="input-box"><input type="text" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input" value="" class="input-text required-entry" /></div></div><div class="input-postcode pcnl-input-housenumber right"><label for="' + prefix + 'postcode_housenumber" class="required">'+ PCNLAPI_CONFIG.translations.houseNumberLabel +' <span class="required">*</span></label><div class="input-box"><input type="text" title="'+ PCNLAPI_CONFIG.translations.houseNumberTitle +'" name="billing[postcode_housenumber]" id="' + prefix + 'postcode_housenumber" value="" class="input-text pcnl-input-text-half required-entry" /></div></div></div>'});
						if (!$(prefix +'postcode_input:checkbox'))
						{
							$(prefix + street1).up('div.line').insert({before: '<div id="' + prefix + 'postcode_input:checkbox" class="pcnl-manual-checkbox line"><div class="full"><input type="checkbox" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input_checkbox" value="" class="checkbox " /><label for="' + prefix + 'postcode_input_checkbox"><label for="' + prefix + 'postcode_input:checkbox">'+ PCNLAPI_CONFIG.translations.manualInputText +'</label></div></div>'});
							$(prefix + 'postcode_input_checkbox').observe('click', function () { pcnlapi.toggleCountryPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4); });
						}
						$(prefix + street1).up('div.line').insert({before: '<div id="' + prefix + 'postcode_input:output" class="pcnl-hidden-field line"><div class="input-box"><label>'+ PCNLAPI_CONFIG.translations.outputLabel +'</label><div id="' + prefix + 'postcode_output" class="pcnl-address-text"></div></div></div>'});
					}
					else if ($(document.body).hasClassName('checkout-onestep-index'))
					{
						// FME One Step Checkout

						if (!$(prefix +'postcode_input:info'))
						{
							$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:info" class="pcnl-info d_3"><div class="input-box"><label class="pcnl-info-label">'+ PCNLAPI_CONFIG.translations.infoLabel +'</label><div class="pcnl-info-text" id="' + prefix + 'postcode_input:info-text">'+ PCNLAPI_CONFIG.translations.infoText +'</div></div></li>'});
						}
						$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:wrapper" class="d_2"><div class="input-postcode d_1"><label for="' + prefix + 'postcode_input" class="required">'+ PCNLAPI_CONFIG.translations.postcodeInputLabel +'<em class="required">*</em></label><div class="input-box"><input type="text" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input" value="" class="input-text required-entry" /></div></div><div class="input-postcode pcnl-input-housenumber d_4"><label for="' + prefix + 'postcode_housenumber" class="required">'+ PCNLAPI_CONFIG.translations.houseNumberLabel +' <em class="required">*</em></label><div class="input-box"><input type="text" title="'+ PCNLAPI_CONFIG.translations.houseNumberTitle +'" name="billing[postcode_housenumber]" id="' + prefix + 'postcode_housenumber" value="" class="input-text pcnl-input-text-half required-entry" /></div></div></li>'});
						if (!$(prefix +'postcode_input:checkbox'))
						{
							$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:checkbox" class="pcnl-manual-checkbox d_3"><div><div class="input-box"><input type="checkbox" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input_checkbox" value="" class="checkbox " /><label for="' + prefix + 'postcode_input_checkbox">'+ PCNLAPI_CONFIG.translations.manualInputText +'</label></div></div></li>'});
							$(prefix + 'postcode_input_checkbox').observe('click', function () { pcnlapi.toggleCountryPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4); });
						}
						$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:output" class="pcnl-hidden-field d_3"><div class="input-box"><label>'+ PCNLAPI_CONFIG.translations.outputLabel +'</label><div id="' + prefix + 'postcode_output" class="pcnl-address-text"></div></div></li>'});
					}
					else if ($(document.body).hasClassName('onepagecheckout-index-index'))
					{
						// IWD Free One Page / Step Checkout

						this.parentElementType = 'div.full, div.two_fields';

						if (!$(prefix +'postcode_input:info'))
						{
							$(prefix + street1).up('div.full').insert({before: '<div id="' + prefix + 'postcode_input:info" class="full"><div><label class="pcnl-info-label">'+ PCNLAPI_CONFIG.translations.infoLabel +'</label><div class="pcnl-info-text" id="' + prefix + 'postcode_input:info-text">'+ PCNLAPI_CONFIG.translations.infoText +'</div></div></div>'});
						}
						$(prefix + street1).up('div.full').insert({before: '<div id="' + prefix + 'postcode_input:wrapper" class="two_fields"><div class="input-postcode short"><label for="' + prefix + 'postcode_input" class="required">'+ PCNLAPI_CONFIG.translations.postcodeInputLabel +'</label> <sup>*</sup><div class="data_area"><input type="text" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input" value="" class="t1 required-entry" /></div></div>' +
							'<div class="input-postcode pcnl-input-housenumber short"><label for="' + prefix + 'postcode_housenumber" class="required">'+ PCNLAPI_CONFIG.translations.houseNumberLabel +'</label> <sup>*</sup><div><input type="text" title="'+ PCNLAPI_CONFIG.translations.houseNumberTitle +'" name="billing[postcode_housenumber]" id="' + prefix + 'postcode_housenumber" value="" class="t1 pcnl-input-text-half required-entry" /></div></div></div>'});
						if (!$(prefix +'postcode_input:checkbox'))
						{
							$(prefix + street1).up('div.full').insert({before: '<ul id="' + prefix + 'postcode_input:checkbox" class="pcnl-manual-checkbox"><li class="options"><input type="checkbox" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input_checkbox" value="" class="checkbox" /><label for="' + prefix + 'postcode_input_checkbox">'+ PCNLAPI_CONFIG.translations.manualInputText +'</label></li></ul>'});
							$(prefix + 'postcode_input_checkbox').observe('click', function () { pcnlapi.toggleCountryPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4); });
						}
						$(prefix + street1).up('div.full').insert({before: '<div id="' + prefix + 'postcode_input:output" class="full pcnl-hidden-field"><label>'+ PCNLAPI_CONFIG.translations.outputLabel +'</label><div class="data_area"><div id="' + prefix + 'postcode_output" class="pcnl-address-text"></div></div></div>'});

						// Relocate telephone field, if it exists
						if ($(prefix + 'telephone'))
						{
							var clone = $(prefix + 'telephone').up('div.short').clone(true);
							$(prefix + 'telephone').up('div.short').remove();
							// Move to after country selector
							$(prefix + countryFieldId).up('div.full').insert({after: '<div class="two_fields" id="'+prefix + 'telephone-moved"></div><div class="clr"></div>'});
							$(prefix + 'telephone-moved').insert(clone);
						}
					}
					else
					{
						// Support for regular Magento 'one page' checkout
						// + Fire Checkout
						// + Quick One Page Checkout (by KAM)

						if (!$(prefix +'postcode_input:info'))
						{
							$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:info" class="wide"><div class="input-box"><label class="pcnl-info-label">'+ PCNLAPI_CONFIG.translations.infoLabel +'</label><div class="pcnl-info-text" id="' + prefix + 'postcode_input:info-text">'+ PCNLAPI_CONFIG.translations.infoText +'</div></div></li>'});
						}
						$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:wrapper" class="fields"><div class="field"><label for="' + prefix + 'postcode_input" class="required"><em>*</em>'+ PCNLAPI_CONFIG.translations.postcodeInputLabel +'</label><div class="input-box"><input type="text" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input" value="" class="input-text required-entry" /></div></div><div class="field"><label for="' + prefix + 'postcode_housenumber" class="required"><em>*</em>'+ PCNLAPI_CONFIG.translations.houseNumberLabel +'</label><div class="input-box"><input type="text" title="'+ PCNLAPI_CONFIG.translations.houseNumberTitle +'" name="billing[postcode_housenumber]" id="' + prefix + 'postcode_housenumber" value="" class="input-text pcnl-input-text-half required-entry" /></div></div></li>'});
						if (!$(prefix +'postcode_input:checkbox'))
						{
							$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:checkbox" class="wide"><div class="field"><div class="input-box"><label><input type="checkbox" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input_checkbox" value="" class="checkbox" /> '+ PCNLAPI_CONFIG.translations.manualInputText +'</label></div></div></li>'});
							$(prefix +'postcode_input_checkbox').observe('click', function () { pcnlapi.toggleCountryPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4); });
						}
						$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:output" class="wide pcnl-hidden-field"><div class="input-box"><label>'+ PCNLAPI_CONFIG.translations.outputLabel +'</label><div id="' + prefix + 'postcode_output" class="pcnl-address-text"></div></div></li>'});
					}

					$(prefix +'postcode_input').observe('change', function(e) { pcnlapi.lookupPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4, e); });
					$(prefix +'postcode_housenumber').observe('change', function(e) { pcnlapi.lookupPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4, e); });
				}
				else
				{
					this.showFields([prefix +'postcode_input', prefix +'postcode_housenumber', prefix +'postcode_housenumber_addition', prefix + 'postcode_input:info-text', prefix + 'postcode_input_checkbox']);
				}

				this.toggleAddressFields(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4);

				// Previous value was not NL, switch manual off
				if ($(prefix + 'postcode_input_checkbox').disabled)
				{
					$(prefix +'postcode_input_checkbox').checked = false;
					this.toggleAddressFields(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4);
				}
				// We're in NL, checkbox is enabled
				$(prefix + 'postcode_input_checkbox').disabled = false;

				// Fill postcode validation input with data from manual data fields (postcode + street)
				if ($(prefix + postcodeFieldId).getValue() != '' && $(prefix +'postcode_input').getValue() == '')
				{
					$(prefix +'postcode_input').setValue($(prefix + postcodeFieldId).getValue());

					var housenumber_match;
					var housenumber = '';
					var housenumber_addition = '';
					if (PCNLAPI_CONFIG.useStreet2AsHouseNumber && $(prefix + street2))
					{
						housenumber_match = $(prefix + street2).getValue().match('^('+ this.REGEXP_HOUSENUMBER +')([^0-9a-zA-Z]*('+ this.REGEXP_HOUSENUMBER_ADDITION +'))?\\s*$');
						if (housenumber_match)
						{
							housenumber = housenumber_match[1].trim();
							housenumber_addition = housenumber_match[3] === undefined ? '' : housenumber_match[3].trim();
						}
					}
					else
					{
						housenumber_match = $(prefix + street1).getValue().match('^('+ this.REGEXP_STREET +')\\s+('+ this.REGEXP_HOUSENUMBER +')([^0-9a-zA-Z]*('+ this.REGEXP_HOUSENUMBER_ADDITION +'))?\\s*$');
						if (housenumber_match)
						{
							housenumber = housenumber_match[2].trim();
							housenumber_addition = housenumber_match[4] === undefined ? '' : housenumber_match[4].trim();
						}
					}

					$(prefix +'postcode_housenumber').setValue((housenumber +' '+ housenumber_addition).trim());
					this.lookupPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4);
				}
			}
			else
			{
				// Address is not in the Netherlands
				// Only toggle things if we have already created elements (test for existence of input checkbox)
				if ($(prefix +'postcode_input_checkbox'))
				{
					$(prefix +'postcode_input_checkbox').checked = true;
					$(prefix +'postcode_input_checkbox').disabled = true;

					this.toggleAddressFields(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4);

					this.setFieldsReadonly([
						prefix +'city',
						prefix +'region',
						prefix + postcodeFieldId,
						prefix + street1,
						prefix + street2,
						prefix + street3,
						prefix + street4,
					], false);

					this.setFieldsReadonly([prefix +'postcode_input', prefix +'postcode_housenumber', prefix +'postcode_housenumber_addition'], true);
					this.hideFields([
					    prefix +'postcode_input',
					    prefix +'postcode_housenumber',
					    prefix +'postcode_housenumber_addition',
					    prefix +'postcode_input:info-text',
					    prefix +'postcode_input_checkbox'
					]);

					this.showFields([prefix + countryFieldId]);

					if ($(prefix +'showcase'))
						Element.remove($(prefix +'showcase'));
				}
			}
		},

		/**
		 * Toggle address field visibility, to be in line with the value of the 'manual input' checkbox.
		 */
		toggleAddressFields: function(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4, values)
		{
			if (!$(prefix + 'postcode_input_checkbox').checked)
			{
				this.setFieldsReadonly([
					prefix + postcodeFieldId,
					prefix + street1,
					prefix + street2,
					prefix + street3,
					prefix + street4,
					prefix + 'city',
					prefix + 'region',
				], true);
				this.hideFields([
					prefix + postcodeFieldId,
					prefix + street1,
					prefix + street2,
					prefix + street3,
					prefix + street4,
					prefix + 'city',
					prefix + 'region',
					prefix + countryFieldId,
				]);
				if (PCNLAPI_CONFIG.neverHideCountry)
				{
					this.showFields([prefix + countryFieldId]);
				}

				// Set empty, will be corrected later
				$(prefix +'postcode_input').value = '';
				$(prefix +'postcode_housenumber').value = '';

				this.setFieldsReadonly([prefix +'postcode_input', prefix + 'postcode_housenumber', prefix + 'postcode_housenumber_addition'], false);
				if ($(prefix +'postcode_output') && $(prefix +'postcode_output').innerHTML != '')
				{
					this.showFields([prefix +'postcode_output']);
				}
			}
			else
			{
				this.removeValidationMessages(prefix);

				this.setFieldsReadonly([
					prefix + postcodeFieldId,
					prefix + street1,
					prefix + street2,
					prefix + street3,
					prefix + street4,
					prefix + 'city',
					prefix + 'region',
				], false);
				this.showFields([
					prefix + postcodeFieldId,
					prefix + street1,
					prefix + street2,
					prefix + street3,
					prefix + street4,
					prefix + 'city',
					prefix + 'region',
					prefix + countryFieldId,
				]);

				// Disable fields
				$(prefix +'postcode_input').setValue(PCNLAPI_CONFIG.translations.disabledText);
				$(prefix +'postcode_housenumber').setValue(PCNLAPI_CONFIG.translations.disabledText);
				this.setFieldsReadonly([prefix +'postcode_input', prefix + 'postcode_housenumber', prefix + 'postcode_housenumber_addition'], true);
				this.hideFields([prefix +'postcode_output']);
			}
		},

		/**
		 * (re)Create the postcode housenumber addition dropdown select box.
		 */
		createPostcodeHouseNumberAddition: function (prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4, values, custom)
		{
			var pcnlapi = this;
			if ($(prefix +'postcode_housenumber_addition:wrapper'))
				Element.remove($(prefix +'postcode_housenumber_addition:wrapper'));
			if ($(prefix +'postcode_housenumber_addition'))
				Element.remove($(prefix +'postcode_housenumber_addition'));

			var options = '';
			if (custom != null)
			{
				if (custom == '')
					custom = '__none__';

				options += '<option value="__select__">'+ PCNLAPI_CONFIG.translations.selectAddition +'</option>';
				options += '<option value="'+ custom.escapeHTML() +'">'+ (custom == '__none__' ? PCNLAPI_CONFIG.translations.noAdditionSelectCustom : PCNLAPI_CONFIG.translations.additionSelectCustom.replace('{addition}', custom.escapeHTML())) +'</option>';
			}
			else if (values.indexOf('') == -1)
			{
				options += '<option value="__none__">'+ PCNLAPI_CONFIG.translations.noAdditionSelectCustom.escapeHTML() +'</option>';
			}

			values.each(function(value)
			{
				options += '<option value="'+ (value == '' ? '__none__' : value.escapeHTML()) +'">'+ (value == '' ? PCNLAPI_CONFIG.translations.noAdditionSelect : value ).escapeHTML() +'</option>';
			});

			if (this.parentElementType == 'tr')
			{
				// We're probably in the admin
				$(prefix + 'postcode_housenumber').up(this.parentElementType).insert({after: '<tr id="' + prefix +'postcode_housenumber_addition:wrapper"><td class="label"><label for="'+ prefix +'postcode_housenumber_addition">'+ PCNLAPI_CONFIG.translations.houseNumberAdditionLabel +' <span class="required">*</span></label></td><td class="value"><select title="'+ PCNLAPI_CONFIG.translations.houseNumberAdditionTitle +'" name="'+ prefix + 'postcode_housenumber_addition" id="' + prefix + 'postcode_housenumber_addition" class="select">'+ options +'</select></td></tr>'});
			}
			else
			{
				// We're probably in the frontend
				$(prefix + 'postcode_housenumber').insert({after: '<select title="'+ PCNLAPI_CONFIG.translations.houseNumberAdditionTitle +'" name="'+ prefix + 'postcode_housenumber_addition" id="' + prefix + 'postcode_housenumber_addition" class="validate-select pcnl-input-text-half">'+ options +'</select>'});
				$(prefix + 'postcode_housenumber').up(this.parentElementType).addClassName('pcnl-with-addition');
			}

			$(prefix +'postcode_housenumber_addition').observe('change', function(e) { pcnlapi.lookupPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4, e); });

			return $(prefix +'postcode_housenumber_addition');
		},

		/**
		 * Inspect our current page, see where we are: configure & attach observers to input fields.
		 */
		addAddressCheckObservers: function ()
		{
			var pcnlapi = this;
			// 'Normal' Checkout pages (OneStepCheckout, Magento Default)
			if ($('billing:postcode'))
			{
				if ($('billing:country_id'))
				{
					$('billing:country_id').observe('change', function () {
						pcnlapi.toggleCountryPostcode('billing:', 'postcode', 'country_id', 'street1', 'street2', 'street3', 'street4');
						// Also toggle shipping, because it may be synced 'silently' with billing
						if ($('shipping:country_id')) {
							pcnlapi.toggleCountryPostcode('shipping:', 'postcode', 'country_id', 'street1', 'street2', 'street3', 'street4');
						}
					});
					if (!$('billing:country_id') || $('billing:country_id').getValue() == 'NL') {
						this.toggleCountryPostcode('billing:', 'postcode', 'country_id', 'street1', 'street2', 'street3', 'street4');
						if ($('shipping:country_id')) {
							// Also toggle shipping, because it may be synced 'silently' with billing
							this.toggleCountryPostcode('shipping:', 'postcode', 'country_id', 'street1', 'street2', 'street3', 'street4');
						}
					}
				}
				if ($('shipping:country_id'))
				{
					$('shipping:country_id').observe('change', function () { pcnlapi.toggleCountryPostcode('shipping:', 'postcode', 'country_id', 'street1', 'street2', 'street3', 'street4'); });
					if (!$('shipping:country_id') || $('shipping:country_id').getValue() == 'NL')
						this.toggleCountryPostcode('shipping:', 'postcode', 'country_id', 'street1', 'street2', 'street3', 'street4');
				}

				// Address-book dropdown changes in checkout
				// (some checkout extensions reset values in a strange way after selecting)
				if ($('billing-address-select'))
				{
					$('billing-address-select').observe('change', function () {
						pcnlapi.toggleCountryPostcode('billing:', 'postcode', 'country_id', 'street1', 'street2', 'street3', 'street4');
					});
				}
				if ($('shipping-address-select'))
				{
					$('shipping-address-select').observe('change', function () {
						pcnlapi.toggleCountryPostcode('shipping:', 'postcode', 'country_id', 'street1', 'street2', 'street3', 'street4');
					});
				}
			}
			// GoMage LightCheckout
			if ($('billing_postcode'))
			{
				if ($('billing_country_id'))
				{
					$('billing_country_id').observe('change', function () { pcnlapi.toggleCountryPostcode('billing_', 'postcode', 'country_id', 'street1', 'street2', 'street3', 'street4'); });
					if (!$('billing_country_id') || $('billing_country_id').getValue() == 'NL')
						this.toggleCountryPostcode('billing_', 'postcode', 'country_id', 'street1', 'street2', 'street3', 'street4');
				}
				if ($('shipping_country_id'))
				{
					$('shipping_country_id').observe('change', function () { pcnlapi.toggleCountryPostcode('shipping_', 'postcode', 'country_id', 'street1', 'street2', 'street3', 'street4'); });
					if (!$('shipping_country_id') || $('shipping_country_id').getValue() == 'NL')
						this.toggleCountryPostcode('shipping_', 'postcode', 'country_id', 'street1', 'street2', 'street3', 'street4');
				}
			}

			// Misc. frontend account address edits
			if ($('street_1') && ($('zip') || $('postcode')))
			{
				var postcodefield = $('zip') ? 'zip' : 'postcode';
				$(postcodefield).observe('change', function(e)
				{
					pcnlapi.lookupPostcode('', postcodefield, 'country', 'street_1', 'street_2', 'street_3', 'street_4', e);
				});

				$('country').observe('change', function () { pcnlapi.toggleCountryPostcode('', postcodefield, 'country', 'street_1', 'street_2', 'street_3', 'street_4'); });

				if ($('country').getValue() == 'NL')
					this.toggleCountryPostcode('', postcodefield, 'country', 'street_1', 'street_2', 'street_3', 'street_4');
			}

			// Default admin address edits
			if ($('postcode') && $('street0'))
			{
				$('postcode').observe('change', function(e)
				{
					pcnlapi.lookupPostcode('', 'postcode', 'country_id', 'street0', 'street1', 'street2', 'street3', e);
				});

				$('country_id').observe('change', function () { pcnlapi.toggleCountryPostcode('', 'postcode', 'country_id', 'street0', 'street1', 'street2', 'street3'); });

				if ($('country_id').getValue() == 'NL')
					this.toggleCountryPostcode('', 'postcode', 'country_id', 'street0', 'street1', 'street2', 'street3');
			}

			// User admin address edits
			if ($('address_form_container'))
			{
				this.observeAdminCustomerAddress();

				$('address_form_container').observe('DOMNodeInserted', function(e) { pcnlapi.observeAdminCustomerAddress(); });
			}

			// Admin 'create order' & 'edit order' address editting
			if ($('order-billing_address'))
			{
				this.observeBillingAddress();
				this.observeShippingAddress();

				// Re-observe blocks after they have been changed
				if ($('order-billing_address'))
					$('order-billing_address').observe('DOMNodeInserted', function(e) { pcnlapi.observeBillingAddress(); });
				if ($('order-shipping_address'))
					$('order-shipping_address').observe('DOMNodeInserted', function(e) { pcnlapi.observeShippingAddress(); });
			}
		},
		observeAdminCustomerAddress: function ()
		{
			var pcnlapi = this;
			for (nr = 1; nr < 15; nr++)
			{
				if ($('_item'+ nr +'postcode') && !$('_item'+ nr +'postcode').observed)
				{
					$('_item'+ nr +'postcode').observe('change', function(e)
					{
						var localNr = nr;
						return function () { pcnlapi.lookupPostcode('_item'+ localNr, 'postcode', 'country_id', 'street0', 'street1', 'street2', 'street3', e);}
					}());

					$('_item'+ nr +'country_id').observe('change', function(e)
					{
						var localNr = nr;
						return function () { pcnlapi.toggleCountryPostcode('_item'+ localNr, 'postcode', 'country_id', 'street0', 'street1', 'street2', 'street3');}
					}());

					$('_item'+ nr +'postcode').observed = true;

					if ($('_item'+ nr +'country_id').getValue() == 'NL')
						this.toggleCountryPostcode('_item'+ nr, 'postcode', 'country_id', 'street0', 'street1', 'street2', 'street3');
				}
			}
		},
		observeBillingAddress: function ()
		{
			var pcnlapi = this;
			// Billing
			if ($('order-billing_address_postcode'))
			{
				$('order-billing_address_postcode').observe('change', function(e)
				{
					pcnlapi.lookupPostcode('order-billing_address_', 'postcode', 'country_id', 'street0', 'street1', 'street2', 'street3', e);
				});
				$('order-billing_address_country_id').observe('change', function ()
				{
					pcnlapi.toggleCountryPostcode('order-billing_address_', 'postcode', 'country_id', 'street0', 'street1', 'street2', 'street3');
				});
				if ($('order-billing_address_country_id').getValue() == 'NL')
					this.toggleCountryPostcode('order-billing_address_', 'postcode', 'country_id', 'street0', 'street1', 'street2', 'street3');
				$('order-billing_address_postcode').observe('postcode:updated', function(e)
				{
					// Custom poke Magento billing-to-shipping copy order logic.
					var event = {
						type: e.type,
						currentTarget: $('order-billing_address_street0'),
						target: $('order-billing_address_street0')
					};
					order.changeAddressField(event);
				});
			}
		},
		observeShippingAddress: function ()
		{
			var pcnlapi = this;
			// Shipping
			if (!$('order-shipping_same_as_billing').checked)
			{
				$('order-shipping_address_postcode').observe('change', function(e)
				{
					pcnlapi.lookupPostcode('order-shipping_address_', 'postcode', 'country_id', 'street0', 'street1', 'street2', 'street3', e);
				});
				$('order-shipping_address_country_id').observe('change', function () { pcnlapi.toggleCountryPostcode('order-shipping_address_', 'postcode', 'country_id', 'street0', 'street1', 'street2', 'street3'); });
				if ($('order-shipping_address_country_id').getValue() == 'NL')
					pcnlapi.toggleCountryPostcode('order-shipping_address_', 'postcode', 'country_id', 'street0', 'street1', 'street2', 'street3');
			}
		}
	};

	// Add observers to address fields on page
	PostcodeNl_Api.addAddressCheckObservers();
});