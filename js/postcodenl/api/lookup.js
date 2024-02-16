var PCNL_START_FUNCTION;
document.observe("dom:loaded", PCNL_START_FUNCTION = function()
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

	function pcnlFireEvent(element,event)
	{
		if (element.dispatchEvent)
		{
	        // dispatch for chrome, firefox + others + IE 9+
	        var evt = document.createEvent("HTMLEvents");
	        evt.initEvent(event, true, true); // event type, bubbling, cancelable
	        return !element.dispatchEvent(evt);
		}
		else if (document.createEventObject)
		{
	    	// dispatch for IE 8-
	        var evt = document.createEventObject();
	        return element.fireEvent('on'+event, evt)
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

		/*
		 * Keep track of what kind of checkout/address page we are enriching
		 */
		enrichType: 'Unknown',

		/*
		 * List of supported / recognized checkout extensions.
		 */
		enrichTypes: {
			'Unknown': 0,
			'Basic': 1,
			'Admin': 2,
			'OneStepCheckout.com': 3,
			'Apptha One Step Checkout': 4,
			'MageStore One Step Checkout': 5,
			'GoMage LightCheckout': 6,
			'MageWorld One Step Checkout Pro': 7,
			'AheadWorks One Step Checkout': 8,
			'J2T OneCheckout': 9,
			'Aitoc One Step Checkout Manager': 10,
			'Magento Templates - OnePage Magento Checkout': 11,
			'EcommerceTeam Easy Checkout 2': 12,
			'GrafischDirect One Step Checkout': 13,
			'FME One Step Checkout': 14,
			'IWD Free One Page / Step Checkout v2': 15,
			'IWD Free One Page / Step Checkout v3': 16,
			'Fire Checkout': 17,
			'Quick One Page Checkout (by KAM)': 18,
			'MAGExtended MasterCheckout': 19,
			'Customer Address Form': 20,
			'Lotusbreath One Step Checkout': 21,
                        'IWD Checkout Suite': 22,
		},
		enrichHint: null,

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
				$(prefix +'postcode_housenumber').removeClassName('validation-failed');
			}
			var advice = Validation.getAdvice('invalid-postcode', $(prefix +'postcode_input'));
			if (advice)
			{
				Validation.hideAdvice($(prefix +'postcode_input'), advice, 'invalid-postcode');
				$(prefix +'postcode_input').removeClassName('validation-failed');
			}
			var advice = Validation.getAdvice('address-is-postofficebox', $(prefix +'postcode_input'));
			if (advice)
			{
				Validation.hideAdvice($(prefix +'postcode_input'), advice, 'address-is-postofficebox');
				$(prefix +'postcode_input').removeClassName('validation-failed');
			}
			if ($(prefix +'postcode_housenumber_addition'))
			{
				var additionAdvice = Validation.getAdvice('invalid-addition', $(prefix +'postcode_housenumber_addition'));
				if (additionAdvice)
				{
					Validation.hideAdvice($(prefix +'postcode_housenumber_addition'), additionAdvice, 'invalid-addition');
					$(prefix +'postcode_housenumber_addition').removeClassName('validation-failed');
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

					if (prop == 'longitude') {
						html += '<dt>See in map</dt><dd><a href="https://www.google.nl/maps/?q=loc:'+ data.latitude +','+ data.longitude +'">Google maps</a></dd>';
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

			var et = this.enrichTypes[this.enrichType] ? this.enrichTypes[this.enrichType] : this.enrichHint;

			var url = PCNLAPI_CONFIG.baseUrl +'lookup?postcode=' + postcode + '&houseNumber=' + housenumber + '&houseNumberAddition=' + housenumber_addition + '&et=' + encodeURIComponent(et);
			if (this.requestCache[url] === undefined)
			{
				new Ajax.Request(url,
				{
					method: 'get',
					onException: function(transport, e)
					{
						var json = {
							'useManual' : true,
							'messageTarget' : 'housenumber',
							'message' : Translator.translate('Validation error, please use manual input.')
						};
						pcnlapi.updatePostcodeLookup(json, housenumber_addition, housenumber_addition_select, prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4, event);
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
			if (PCNLAPI_CONFIG.showcase && data.showcaseResponse)
			{
				if ($(prefix +'showcase'))
					$(prefix +'showcase').remove();

				var info = this.getFieldListHtml(data.showcaseResponse, 'pcnl-showcase');

				if ($(prefix + street1).up(this.parentElementType))
				{
					if (this.parentElementType == 'li')
					{
						$(prefix + street1).up(this.parentElementType).insert({before: '<li id="' + prefix +'showcase" class="wide"><div class="input-box"><h4 class="pcnl-showcase">'+ PCNLAPI_CONFIG.translations.apiShowcase.escapeHTML() +'</h4>'+ info + '</div></li>'});
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

				if (data.debugInfo !== undefined)
				{
					// Add enrich type
					data.debugInfo.enrichType = this.enrichType;

					// It could be that we have no debug info, even if it is switched on
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
					if (PCNLAPI_CONFIG.useStreet3AsHouseNumberAddition && $(prefix + street3))
					{
						$(prefix + street2).setValue(data.houseNumber);
						$(prefix + street3).setValue((data.houseNumberAddition ? data.houseNumberAddition : housenumber_addition).trim());
					}
					else
					{
						$(prefix + street2).setValue((data.houseNumber +' '+ (data.houseNumberAddition ? data.houseNumberAddition : housenumber_addition)).trim());
					}
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

				var hasAdvice = false;

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
						$(prefix +'postcode_housenumber_addition').removeClassName('validation-passed');
						$(prefix +'postcode_housenumber_addition').addClassName('validation-failed');
						hasAdvice = true;
					}
					else
					{
						$(prefix + 'postcode_housenumber_addition').addClassName('validation-passed');
					}
				}
				else if (data.houseNumberAddition == null)
				{
					// Selected housenumber addition is not known, and the select dropdown does not contain that value

					var additionSelect = this.createPostcodeHouseNumberAddition(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4, data.houseNumberAdditions, housenumber_addition);

					newAdvice = Validation.createAdvice('invalid-addition', $(prefix +'postcode_housenumber_addition'), false, (housenumber_addition != '' ? PCNLAPI_CONFIG.translations.houseNumberAdditionUnknown.replace('{addition}', housenumber_addition) : PCNLAPI_CONFIG.translations.houseNumberAdditionRequired));
					Validation.showAdvice($(prefix +'postcode_housenumber_addition'), newAdvice, 'invalid-addition');
					$(prefix +'postcode_housenumber_addition').removeClassName('validation-passed');
					$(prefix +'postcode_housenumber_addition').addClassName('validation-failed');
					hasAdvice = true;
				}
				else if (data.houseNumberAdditions.length > 1 || (data.houseNumberAdditions.length == 1 && data.houseNumberAdditions[0] != ''))
				{
					// Address has multiple housenumber additions
					var additionSelect = this.createPostcodeHouseNumberAddition(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4, data.houseNumberAdditions);
					additionSelect.setValue(data.houseNumberAddition);

					$(prefix + 'postcode_housenumber_addition').addClassName('validation-passed');
				}
				else
				{
					// Address has only one valid addition, and it is the 'no addition' option
					this.removeHousenumberAddition(prefix);
				}

				if (data.street == 'Postbus' && PCNLAPI_CONFIG.blockPostOfficeBoxAddresses)
				{
					newAdvice = Validation.createAdvice('address-is-postofficebox', $(prefix + 'postcode_input'), false, PCNLAPI_CONFIG.translations.postOfficeBoxNotAllowed);
					Validation.showAdvice($(prefix + postcodeFieldId), newAdvice, 'address-is-postofficebox');
					$(prefix + postcodeFieldId).removeClassName('validation-passed');
					$(prefix + postcodeFieldId).addClassName('validation-failed');
					hasAdvice = true;
				}

				if (!hasAdvice)
				{
					$(prefix + postcodeFieldId).addClassName('validation-passed');
					$(prefix + 'postcode_housenumber').addClassName('validation-passed');
				}
			}
			else if (data.message !== undefined)
			{
				// Address check returned an error
				if (typeof data.useManual !== 'undefined' && data.useManual === true) {
					$(prefix + 'postcode_input_checkbox').click();
				}
				var target = (data.messageTarget == 'postcode' ? 'postcode_input' : 'postcode_housenumber');

				newAdvice = Validation.createAdvice('invalid-postcode', $(prefix + target), false, data.message);
				Validation.showAdvice($(prefix + target), newAdvice, 'invalid-postcode');
				$(prefix + target).removeClassName('validation-passed');
				$(prefix + target).addClassName('validation-failed');

				this.removeHousenumberAddition(prefix);
			}
			else
			{
				// Address check did not return an error or a postcode result (something else wrong)

				var target = (data.messageTarget == 'postcode' ? 'postcode_input' : 'postcode_housenumber');

				newAdvice = Validation.createAdvice('invalid-postcode', $(prefix + target), false, '');
				Validation.showAdvice($(prefix + target), newAdvice, 'invalid-postcode');
				$(prefix + target).removeClassName('validation-passed');
				$(prefix + target).addClassName('validation-failed');

				this.removeHousenumberAddition(prefix);
			}

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
				this.enrichHint = $(document.body).className.trim().replace(' ', ',');

				if (!$(prefix +'postcode_input:wrapper'))
				{
					if ($$('table.form-list').length > 0 && $(prefix + postcodeFieldId).parentNode.tagName == 'TD')
					{
						// We're probably in the admin, slightly different logic than the frontend checkout forms
						this.enrichType = 'Admin';

						this.parentElementType = 'tr';

						$(prefix + street1).up('tr').insert({before: '<tr id="' + prefix + 'postcode_input:wrapper"><td class="label"><label for="' + prefix + 'postcode_input">'+ PCNLAPI_CONFIG.translations.postcodeInputLabel +' <span class="required">*</span></label></td><td class="value"><input type="text" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input" value="" class="input-text required-entry" /></td></tr><tr id="' + prefix + 'postcode_housenumber:wrapper"><td class="label"><label for="' + prefix + 'postcode_housenumber">'+ PCNLAPI_CONFIG.translations.houseNumberLabel +' <span class="required">*</span></label></td><td class="value"><input type="text" title="'+ PCNLAPI_CONFIG.translations.houseNumberTitle +'" name="billing[postcode_housenumber]" id="' + prefix + 'postcode_housenumber" value="" class="input-text pcnl-input-text-half required-entry" /></td></tr>'});
						$(prefix + street1).up('tr').insert({before: '<tr id="' + prefix + 'postcode_input:checkbox"><td class="label"><label for="' + prefix + 'postcode_input_checkbox"> '+ PCNLAPI_CONFIG.translations.manualInputLabel +' <span class="required">*</span></label></td><td class="value"><input type="checkbox" id="' + prefix + 'postcode_input_checkbox" value="" class="checkbox" /><label for="' + prefix + 'postcode_input_checkbox">'+ PCNLAPI_CONFIG.translations.manualInputText +'</label></td></tr>'});
						$(prefix +'postcode_input_checkbox').observe('click', function () { pcnlapi.toggleCountryPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4); });
					}
					else if ($(document.body).hasClassName('onestepcheckout-index-index') && $('onestepcheckout-form'))
					{
						// Support for OneStepCheckout.com extension
						this.enrichType = 'OneStepCheckout.com';

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
						this.enrichType = 'Apptha One Step Checkout';

						if (!$(prefix +'postcode_input:info'))
						{
							$(prefix + street1).up('li').insert({before:
								'<li id="' + prefix + 'postcode_input:info">'+
									'<div class="input-box">'+
										'<label class="pcnl-info-label">'+ PCNLAPI_CONFIG.translations.infoLabel +'</label>'+
										'<div class="pcnl-info-text" id="' + prefix + 'postcode_input:info-text">'+ PCNLAPI_CONFIG.translations.infoText +'</div>'+
									'</div>'+
								'</li>'
							});
						}
						$(prefix + street1).up('li').insert({before:
							'<li id="' + prefix + 'postcode_input:wrapper">'+
								'<div class="pcnl-apptha-fields">'+
									'<div class="field">'+
										'<label for="' + prefix + 'postcode_input" class="required">'+ PCNLAPI_CONFIG.translations.postcodeInputLabel +'<em>*</em></label>'+
										'<div class="input-box"><input type="text" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input" value="" class="input-text required-entry" /></div>'+
									'</div>'+
									'<div class="field input-postcode pcnl-input-housenumber">'+
										'<label for="' + prefix + 'postcode_housenumber" class="required">'+ PCNLAPI_CONFIG.translations.houseNumberLabel +' <em>*</em></label>'+
										'<div class="input-box"><input type="text" title="'+ PCNLAPI_CONFIG.translations.houseNumberTitle +'" name="billing[postcode_housenumber]" id="' + prefix + 'postcode_housenumber" value="" class="input-text pcnl-input-text-half required-entry" /></div>'+
									'</div>'+
								'</div>'+
							'</li>'
						});
						if (!$(prefix +'postcode_input:checkbox'))
						{
							$(prefix + street1).up('li').insert({before:
								'<li id="' + prefix + 'postcode_input:checkbox" class="pcnl-apptha-checkbox">'+
									'<div class="field">'+
										'<div class="input-box">'+
											'<input type="checkbox" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input_checkbox" value="" class="checkbox" />'+
											'<label for="' + prefix + 'postcode_input_checkbox">'+ PCNLAPI_CONFIG.translations.manualInputText +'</label>'+
										'</div>'+
									'</div>'+
								'</li>'
							});
							$(prefix +'postcode_input_checkbox').observe('click', function () { pcnlapi.toggleCountryPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4); });
						}
						$(prefix + street1).up('li').insert({before:
							'<li id="' + prefix + 'postcode_input:output" class="pcnl-hidden-field">'+
								'<div class="input-box">'+
									'<label>'+ PCNLAPI_CONFIG.translations.outputLabel +'</label>'+
									'<div id="' + prefix + 'postcode_output" class="pcnl-address-text"></div>'+
								'</div>'+
							'</li>'
						});
					}
					else if ($(document.body).hasClassName('onestepquickcheckout_index_index') || ($(document.body).hasClassName('onestepcheckout-index-index') && $('one-step-checkout-form')))
					{
						// Support for MageStore One Step Checkout extension
						this.enrichType = 'MageStore One Step Checkout';

						if (!$(prefix +'postcode_input:info'))
						{
							$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:info" class="wide"><label class="pcnl-info-label">'+ PCNLAPI_CONFIG.translations.infoLabel +'</label><div class="pcnl-info-text" id="' + prefix + 'postcode_input:info-text">'+ PCNLAPI_CONFIG.translations.infoText +'</div></li>'});
						}
						$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:wrapper"><div class="two-fields input-postcode"><label for="' + prefix + 'postcode_input">'+ PCNLAPI_CONFIG.translations.postcodeInputLabel +' <span class="required">*</span></label><br>'+
							'<input type="text" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input" value="" class="input-text required-entry" /></div>'+
							'<div class="two-fields input-postcode pcnl-input-housenumber"><label for="' + prefix + 'postcode_housenumber">'+ PCNLAPI_CONFIG.translations.houseNumberLabel +' <span class="required">*</span></label><br><input type="text" title="'+ PCNLAPI_CONFIG.translations.houseNumberTitle +'" name="billing[postcode_housenumber]" id="' + prefix + 'postcode_housenumber" value="" class="input-text pcnl-input-text-half required-entry" /></div></li>'});

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
						this.enrichType = 'GoMage LightCheckout';

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
					else if ($(document.body).hasClassName('checkout-onepage-index') && $('mw-osc-column-container'))
					{
						// Support for MageWorld One Step Checkout Pro
						this.enrichType = 'MageWorld One Step Checkout Pro';

						if (!$(prefix +'postcode_input:info'))
						{
							$(prefix + street1).up('li.fields').insert({before:
								'<li id="' + prefix + 'postcode_input:info">'+
									'<div class="input-box">'+
										'<label class="pcnl-info-label">'+ PCNLAPI_CONFIG.translations.infoLabel +'</label>'+
										'<div class="pcnl-info-text" id="' + prefix + 'postcode_input:info-text">'+ PCNLAPI_CONFIG.translations.infoText +'</div>'+
									'</div>'+
								'</li>'
							});
						}
						$(prefix + street1).up('li.fields').insert({before:
							'<li id="' + prefix + 'postcode_input:wrapper">'+
								'<div>'+
									'<div class="field">'+
										'<label for="' + prefix + 'postcode_input" class="required">'+ PCNLAPI_CONFIG.translations.postcodeInputLabel +'<em>*</em></label>'+
										'<div class="input-box"><input type="text" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input" value="" class="input-text required-entry" /></div>'+
									'</div>'+
									'<div class="field input-postcode pcnl-input-housenumber">'+
										'<label for="' + prefix + 'postcode_housenumber" class="required">'+ PCNLAPI_CONFIG.translations.houseNumberLabel +' <em>*</em></label>'+
										'<div class="input-box"><input type="text" title="'+ PCNLAPI_CONFIG.translations.houseNumberTitle +'" name="billing[postcode_housenumber]" id="' + prefix + 'postcode_housenumber" value="" class="input-text pcnl-input-text-half required-entry" /></div>'+
									'</div>'+
								'</div>'+
							'</li>'
						});
						if (!$(prefix +'postcode_input:checkbox'))
						{
							$(prefix + street1).up('li.fields').insert({before:
								'<li id="' + prefix + 'postcode_input:checkbox">'+
									'<div>'+
										'<div class="input-box">'+
											'<input type="checkbox" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input_checkbox" value="" class="checkbox" />'+
											'<label for="' + prefix + 'postcode_input_checkbox">'+ PCNLAPI_CONFIG.translations.manualInputText +'</label>'+
										'</div>'+
									'</div>'+
								'</li>'
							});
							$(prefix +'postcode_input_checkbox').observe('click', function () { pcnlapi.toggleCountryPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4); });
						}
						$(prefix + street1).up('li.fields').insert({before:
							'<li id="' + prefix + 'postcode_input:output" class="pcnl-hidden-field">'+
								'<div class="input-box">'+
									'<label>'+ PCNLAPI_CONFIG.translations.outputLabel +'</label>'+
									'<div id="' + prefix + 'postcode_output" class="pcnl-address-text"></div>'+
								'</div>'+
							'</li>'
						});
					}
					else if ($(document.body).hasClassName('aw-onestepcheckout-index-index'))
					{
						// Support for AheadWorks One Step Checkout
						this.enrichType = 'AheadWorks One Step Checkout';

						this.parentElementType = 'div.aw-onestepcheckout-general-form-field';

						if (!$(prefix +'postcode_input:info'))
						{
							$(prefix + street1).up('div.aw-onestepcheckout-general-form-field').insert({before:
								'<div class="aw-onestepcheckout-general-form-field aw-onestepcheckout-general-form-field-wide" id="' + prefix + 'postcode_input:info">'+
									'<label class="pcnl-info-label">'+ PCNLAPI_CONFIG.translations.infoLabel +'</label>'+
									'<div class="input-box">'+
										'<div class="pcnl-info-text" id="' + prefix + 'postcode_input:info-text">'+ PCNLAPI_CONFIG.translations.infoText +'</div>'+
									'</div>'+
									'<div style="clear:both;"></div>'+
								'</div>'
							});
						}

						$(prefix + street1).up('div.aw-onestepcheckout-general-form-field').insert({before:
							'<div id="' + prefix + 'postcode_input:wrapper">'+
								'<div class="aw-onestepcheckout-general-form-field aw-onestepcheckout-general-form-field-left">'+
									'<label for="' + prefix + 'postcode_input" class="required"><em>*</em>'+ PCNLAPI_CONFIG.translations.postcodeInputLabel +'</label>'+
									'<div class="input-box"><input type="text" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input" value="" class="input-text required-entry" /></div>'+
									'<div style="clear:both;"></div>'+
								'</div>'+
								'<div class="aw-onestepcheckout-general-form-field aw-onestepcheckout-general-form-field-right input-postcode pcnl-input-housenumber">'+
									'<label for="' + prefix + 'postcode_housenumber" class="required"><em>*</em>'+ PCNLAPI_CONFIG.translations.houseNumberLabel +'</label>'+
									'<div class="input-box"><input type="text" title="'+ PCNLAPI_CONFIG.translations.houseNumberTitle +'" name="billing[postcode_housenumber]" id="' + prefix + 'postcode_housenumber" value="" class="input-text pcnl-input-text-half required-entry" /></div>'+
									'<div style="clear:both;"></div>'+
								'</div>'+
							'</div>'
						});
						if (!$(prefix +'postcode_input:checkbox'))
						{
							$(prefix + street1).up('div.aw-onestepcheckout-general-form-field').insert({before:
								'<div id="' + prefix + 'postcode_input:checkbox">'+
									'<div class="aw-onestepcheckout-general-form-field">'+
										'<div class="control">'+
											'<input type="checkbox" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input_checkbox" value="" class="checkbox" />'+
											'<label for="' + prefix + 'postcode_input_checkbox">'+ PCNLAPI_CONFIG.translations.manualInputText +'</label>'+
										'</div>'+
									'</div>'+
									'<div style="clear:both;"></div>'+
								'</div>'
							});
							$(prefix +'postcode_input_checkbox').observe('click', function () { pcnlapi.toggleCountryPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4); });
						}
						$(prefix + street1).up('div.aw-onestepcheckout-general-form-field').insert({before:
							'<div class="aw-onestepcheckout-general-form-field aw-onestepcheckout-general-form-field-wide" id="' + prefix + 'postcode_input:output" class="pcnl-hidden-field">'+
								'<div class="input-box">'+
									'<label>'+ PCNLAPI_CONFIG.translations.outputLabel +'</label>'+
									'<div id="' + prefix + 'postcode_output" class="pcnl-address-text"></div>'+
								'</div>'+
							'</div>'
						});
					}
					else if ($(document.body).hasClassName('checkout-onepage-index') && $('j2t-onecheckout-main'))
					{
						// Support for J2T OneCheckout
						this.enrichType = 'J2T OneCheckout';

						if (!$(prefix +'postcode_input:info'))
						{
							$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:info" class="pcnl-info"><div><label class="pcnl-info-label">'+ PCNLAPI_CONFIG.translations.infoLabel +'</label><div class="pcnl-info-text" id="' + prefix + 'postcode_input:info-text">'+ PCNLAPI_CONFIG.translations.infoText +'</div></div></li>'});
						}
						$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:wrapper" class="fields"><div class="field input-postcode"><label for="' + prefix + 'postcode_input" class="required">'+ PCNLAPI_CONFIG.translations.postcodeInputLabel +'<em class="required">*</em></label><div class="input-box"><div class="field-wrapper"><input type="text" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input" value="" class="input-text required-entry" /></div></div></div><div class="field input-postcode pcnl-input-housenumber"><label for="' + prefix + 'postcode_housenumber" class="required">'+ PCNLAPI_CONFIG.translations.houseNumberLabel +' <em class="required">*</em></label><div class="input-box"><div class="field-wrapper"><input type="text" title="'+ PCNLAPI_CONFIG.translations.houseNumberTitle +'" name="billing[postcode_housenumber]" id="' + prefix + 'postcode_housenumber" value="" class="input-text pcnl-input-text-half required-entry" /></div></div></div></li>'});
						if (!$(prefix +'postcode_input:checkbox'))
						{
							$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:checkbox" class="control pcnl-manual-checkbox"><div class="fields"><div class="input-box"><input type="checkbox" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input_checkbox" value="" class="checkbox " /><label for="' + prefix + 'postcode_input_checkbox">'+ PCNLAPI_CONFIG.translations.manualInputText +'</label></div></div></li>'});

							$(prefix + 'postcode_input_checkbox').observe('click', function () { pcnlapi.toggleCountryPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4); });
						}
						$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:output" class="pcnl-hidden-field"><div><label>'+ PCNLAPI_CONFIG.translations.outputLabel +'</label><div id="' + prefix + 'postcode_output" class="pcnl-address-text"></div></div></li>'});
					}
					else if ($(document.body).hasClassName('aitcheckout-checkout-index'))
					{
						// Support for Aitoc One Step Checkout Manager
						this.enrichType = 'Aitoc One Step Checkout Manager';

						if (!$(prefix +'postcode_input:info'))
						{
							$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:info" class="pcnl-info"><div><label class="pcnl-info-label">'+ PCNLAPI_CONFIG.translations.infoLabel +'</label><div class="pcnl-info-text" id="' + prefix + 'postcode_input:info-text">'+ PCNLAPI_CONFIG.translations.infoText +'</div></div></li>'});
						}
						$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:wrapper" class="fields"><div class="field compact input-postcode"><label for="' + prefix + 'postcode_input" class="required">'+ PCNLAPI_CONFIG.translations.postcodeInputLabel +'<em class="required">*</em></label><div class="input-box"><div class="field-wrapper"><input type="text" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input" value="" class="input-text required-entry" /></div></div></div><div class="field compact input-postcode pcnl-input-housenumber"><label for="' + prefix + 'postcode_housenumber" class="required">'+ PCNLAPI_CONFIG.translations.houseNumberLabel +' <em class="required">*</em></label><div class="input-box"><div class="field-wrapper"><input type="text" title="'+ PCNLAPI_CONFIG.translations.houseNumberTitle +'" name="billing[postcode_housenumber]" id="' + prefix + 'postcode_housenumber" value="" class="input-text pcnl-input-text-half required-entry" /></div></div></div></li>'});
						if (!$(prefix +'postcode_input:checkbox'))
						{
							$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:checkbox" class="control pcnl-manual-checkbox"><div class="fields"><div class="input-box"><input type="checkbox" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input_checkbox" value="" class="checkbox " /><label for="' + prefix + 'postcode_input_checkbox">'+ PCNLAPI_CONFIG.translations.manualInputText +'</label></div></div></li>'});

							$(prefix + 'postcode_input_checkbox').observe('click', function () { pcnlapi.toggleCountryPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4); });
						}
						$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:output" class="pcnl-hidden-field"><div><label>'+ PCNLAPI_CONFIG.translations.outputLabel +'</label><div id="' + prefix + 'postcode_output" class="pcnl-address-text"></div></div></li>'});
					}
					else if ($(document.body).hasClassName('checkout-onepage-index') && $(document.body).hasClassName('layout-3columns'))
					{
						// Support for Magento Templates - OnePage Magento Checkout
						this.enrichType = 'Magento Templates - OnePage Magento Checkout';

						if (!$(prefix +'postcode_input:info'))
						{
							$(prefix + 'country_id').up('li').insert({before: '<li id="' + prefix + 'postcode_input:info" class="pcnl-info"><div><label class="pcnl-info-label">'+ PCNLAPI_CONFIG.translations.infoLabel +'</label><div class="pcnl-info-text" id="' + prefix + 'postcode_input:info-text">'+ PCNLAPI_CONFIG.translations.infoText +'</div></div></li>'});
						}
						$(prefix + 'country_id').up('li').insert({before: '<li id="' + prefix + 'postcode_input:wrapper" class="fields"><div class="field input-postcode"><label for="' + prefix + 'postcode_input" class="required">'+ PCNLAPI_CONFIG.translations.postcodeInputLabel +'<em class="required">*</em></label><div class="input-box"><div class="field-wrapper"><input type="text" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input" value="" class="input-text required-entry" /></div></div></div><div class="field input-postcode pcnl-input-housenumber"><label for="' + prefix + 'postcode_housenumber" class="required">'+ PCNLAPI_CONFIG.translations.houseNumberLabel +' <em class="required">*</em></label><div class="input-box"><div class="field-wrapper"><input type="text" title="'+ PCNLAPI_CONFIG.translations.houseNumberTitle +'" name="billing[postcode_housenumber]" id="' + prefix + 'postcode_housenumber" value="" class="input-text pcnl-input-text-half required-entry" /></div></div></div></li>'});
						if (!$(prefix +'postcode_input:checkbox'))
						{
							$(prefix + 'country_id').up('li').insert({before: '<li id="' + prefix + 'postcode_input:checkbox" class="control pcnl-manual-checkbox"><div class="fields"><div class="input-box"><input type="checkbox" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input_checkbox" value="" class="checkbox " /><label for="' + prefix + 'postcode_input_checkbox">'+ PCNLAPI_CONFIG.translations.manualInputText +'</label></div></div></li>'});

							$(prefix + 'postcode_input_checkbox').observe('click', function () { pcnlapi.toggleCountryPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4); });
						}
						$(prefix + 'country_id').up('li').insert({before: '<li id="' + prefix + 'postcode_input:output" class="pcnl-hidden-field"><div><label>'+ PCNLAPI_CONFIG.translations.outputLabel +'</label><div id="' + prefix + 'postcode_output" class="pcnl-address-text"></div></div></li>'});
					}
					else if ($(document.body).hasClassName('checkout-onepage-index') && $('easycheckout-form-wrap'))
					{
						// Support for EcommerceTeam Easy Checkout 2
						this.enrichType = 'EcommerceTeam Easy Checkout 2';

						if (!$(prefix +'postcode_input:info'))
						{
							$(prefix + 'country_id').up('li').insert({before: '<li id="' + prefix + 'postcode_input:info" class="pcnl-info"><div><label class="pcnl-info-label">'+ PCNLAPI_CONFIG.translations.infoLabel +'</label><div class="pcnl-info-text" id="' + prefix + 'postcode_input:info-text">'+ PCNLAPI_CONFIG.translations.infoText +'</div></div></li>'});
						}
						$(prefix + 'country_id').up('li').insert({before: '<li id="' + prefix + 'postcode_input:wrapper" class="fields"><div class="field input-postcode"><label for="' + prefix + 'postcode_input" class="required">'+ PCNLAPI_CONFIG.translations.postcodeInputLabel +'<em class="required">*</em></label><div class="input-box"><div class="field-wrapper"><input type="text" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input" value="" class="input-text required-entry" /></div></div></div><div class="field input-postcode pcnl-input-housenumber"><label for="' + prefix + 'postcode_housenumber" class="required">'+ PCNLAPI_CONFIG.translations.houseNumberLabel +' <em class="required">*</em></label><div class="input-box"><div class="field-wrapper"><input type="text" title="'+ PCNLAPI_CONFIG.translations.houseNumberTitle +'" name="billing[postcode_housenumber]" id="' + prefix + 'postcode_housenumber" value="" class="input-text pcnl-input-text-half required-entry" /></div></div></div></li>'});
						if (!$(prefix +'postcode_input:checkbox'))
						{
							$(prefix + 'country_id').up('li').insert({before: '<li id="' + prefix + 'postcode_input:checkbox" class="pcnl-manual-checkbox"><div class="field"><label for="' + prefix + 'postcode_input_checkbox">'+ PCNLAPI_CONFIG.translations.manualInputText +'</label><input type="checkbox" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input_checkbox" value="" class="checkbox " /></div></li>'});
							$(prefix + 'postcode_input_checkbox').observe('click', function () { pcnlapi.toggleCountryPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4); });
						}
						$(prefix + 'country_id').up('li').insert({before: '<li id="' + prefix + 'postcode_input:output" class="pcnl-hidden-field"><div><label>'+ PCNLAPI_CONFIG.translations.outputLabel +'</label><div id="' + prefix + 'postcode_output" class="pcnl-address-text"></div></div></li>'});
					}
					else if ($(document.body).hasClassName('checkout-onestep-index') && $('easycheckout-login-form'))
					{
						// GrafischDirect One Step Checkout
						this.enrichType = 'GrafischDirect One Step Checkout';

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
						this.enrichType = 'FME One Step Checkout';

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
						// IWD Free One Page / Step Checkout v2
						this.enrichType = 'IWD Free One Page / Step Checkout v2';

						this.parentElementType = 'div.full, div.two_fields, ul.pcnl-manual-checkbox';

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
					else if ($(document.body).hasClassName('opc-index-index'))
					{
						// IWD Free One Page / Step Checkout v3
						this.enrichType = 'IWD Free One Page / Step Checkout v3';

						if (!$(prefix +'postcode_input:info'))
						{
							$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:info" class="wide pcnl-info"><div><label class="pcnl-info-label">'+ PCNLAPI_CONFIG.translations.infoLabel +'</label><div class="pcnl-info-text" id="' + prefix + 'postcode_input:info-text">'+ PCNLAPI_CONFIG.translations.infoText +'</div></div></li>'});
						}
						$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:wrapper" class="fields"><div class="field input-postcode"><label for="' + prefix + 'postcode_input" class="required">'+ PCNLAPI_CONFIG.translations.postcodeInputLabel +'<em class="required">*</em></label><div class="input-box"><div class="field-wrapper"><input type="text" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" name="' + prefix + 'postcode_input" id="' + prefix + 'postcode_input" value="" class="input-text required-entry" /></div></div></div><div class="field input-postcode pcnl-input-housenumber"><label for="' + prefix + 'postcode_housenumber" class="required">'+ PCNLAPI_CONFIG.translations.houseNumberLabel +' <em class="required">*</em></label><div class="input-box"><div class="field-wrapper"><input type="text" title="'+ PCNLAPI_CONFIG.translations.houseNumberTitle +'" name="' + prefix + 'postcode_housenumber" id="' + prefix + 'postcode_housenumber" value="" class="input-text pcnl-input-text-half required-entry" /></div></div></div></li>'});
						if (!$(prefix +'postcode_input:checkbox'))
						{
							$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:checkbox" class="wide control pcnl-manual-checkbox"><div class="fields"><div class="input-box"><input type="checkbox" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input_checkbox" value="" class="checkbox " /><label for="' + prefix + 'postcode_input_checkbox">'+ PCNLAPI_CONFIG.translations.manualInputText +'</label></div></div></li>'});

							$(prefix + 'postcode_input_checkbox').observe('click', function () { pcnlapi.toggleCountryPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4); });
						}
						$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:output" class="wide pcnl-hidden-field"><div><label>'+ PCNLAPI_CONFIG.translations.outputLabel +'</label><div id="' + prefix + 'postcode_output" class="pcnl-address-text"></div></div></li>'});
					}
                                        else if ($(document.body).hasClassName('iwd-opc-index-index'))
					{
                                            // IWD Checkout Suite
                                            this.enrichType = 'IWD Checkout Suite';

                                            type = prefix.replace(":", "");
                                            street_lines = $$('input[name="' + type + '[street][]"');
                                            var i = 1;
                                            street_lines.each(function (element) {
                                                $(element).writeAttribute("id", type + ":street" + i);
                                                i++;
                                            });

                                            $$('input[name="' + type + '[city]"')[0].writeAttribute("id", type + ":city");
                                            $$('input[name="' + type + '[postcode]"')[0].writeAttribute("id", type + ":postcode");

                                            if (!$(prefix + 'postcode_input:info'))
                                            {
                                                $(prefix + street1).up('div').insert({before: '<div id="' + prefix + 'postcode_input:info" class="wide pcnl-info"><div><label class="pcnl-info-label">' + PCNLAPI_CONFIG.translations.infoLabel + '</label><div class="pcnl-info-text" id="' + prefix + 'postcode_input:info-text">' + PCNLAPI_CONFIG.translations.infoText + '</div></div></div>'});
                                            }
                                            $(prefix + street1).up('div').insert({before: '<div id="' + prefix + 'postcode_input:wrapper" class="fields "><div class="field input-postcode pcnl-wrapper-half"><label for="' + prefix + 'postcode_input" class="required">' + PCNLAPI_CONFIG.translations.postcodeInputLabel + '<em class="required">*</em></label><div class="iwd_opc_universal_wrapper"><input type="text" title="' + PCNLAPI_CONFIG.translations.postcodeInputTitle + '" name="' + prefix + 'postcode_input" id="' + prefix + 'postcode_input" value="" class="input-text required-entry iwd_opc_field iwd_opc_input" /></div></div><div class="field input-postcode pcnl-input-housenumber"><label for="' + prefix + 'postcode_housenumber" class="required">' + PCNLAPI_CONFIG.translations.houseNumberLabel + ' <em class="required">*</em></label><div class="input-box"><div class="iwd_opc_universal_wrapper"><input type="text" title="' + PCNLAPI_CONFIG.translations.houseNumberTitle + '" name="' + prefix + 'postcode_housenumber" id="' + prefix + 'postcode_housenumber" value="" class="input-text pcnl-input-text-half required-entry iwd_opc_field iwd_opc_input" /></div></div></div></div>'});
                                            if (!$(prefix + 'postcode_input:checkbox'))
                                            {
                                                $(prefix + street1).up('div').insert({before: '<div id="' + prefix + 'postcode_input:checkbox" class="wide control pcnl-manual-checkbox"><div class="fields"><input type="checkbox" title="' + PCNLAPI_CONFIG.translations.postcodeInputTitle + '" id="' + prefix + 'postcode_input_checkbox" value="" class="checkbox " /><label for="' + prefix + 'postcode_input_checkbox">' + PCNLAPI_CONFIG.translations.manualInputText + '</label></div></div>'});

                                                $(prefix + 'postcode_input_checkbox').observe('click', function () {
                                                    pcnlapi.toggleCountryPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4);
                                                });
                                            }
                                            $(prefix + street1).up('div').insert({before: '<div id="' + prefix + 'postcode_input:output" class="wide pcnl-hidden-field"><div><label>'+ PCNLAPI_CONFIG.translations.outputLabel +'</label><div id="' + prefix + 'postcode_output" class="pcnl-address-text"></div></div></div>'});
                                        }
					else
					{
						// Support for regular Magento 'one page' checkout
						// + Fire Checkout
						// + Quick One Page Checkout (by KAM)
						// + MAGExtended MasterCheckout
						// + Lotusbreath One Step Checkout

						if ($(document.body).hasClassName('firecheckout-index-index'))
							this.enrichType = 'Fire Checkout';
						else if ($(document.body).hasClassName('checkout-onepage-index') && $$('.qocadvanced-threecolumns').length > 0)
							this.enrichType = 'Quick One Page Checkout (by KAM)';
						else if ($(document.body).hasClassName('mastercheckout-index-index'))
							this.enrichType = 'MAGExtended MasterCheckout';
						else if ($(document.body).hasClassName('lotusbreath-onestepcheckout-index-index'))
							this.enrichType = 'Lotusbreath One Step Checkout';
						else if ($(document.body).hasClassName('checkout-onepage-index'))
							this.enrichType = 'Basic';
						else if ($(document.body).hasClassName('customer-address-form'))
							this.enrichType = 'Customer Address Form';
						else
							this.enrichType = 'Unknown';

						if (!$(prefix +'postcode_input:info'))
						{
							$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:info" class="wide pcnl-info"><div><label class="pcnl-info-label">'+ PCNLAPI_CONFIG.translations.infoLabel +'</label><div class="pcnl-info-text" id="' + prefix + 'postcode_input:info-text">'+ PCNLAPI_CONFIG.translations.infoText +'</div></div></li>'});
						}
						$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:wrapper" class="fields"><div class="field input-postcode"><label for="' + prefix + 'postcode_input" class="required">'+ PCNLAPI_CONFIG.translations.postcodeInputLabel +'<em class="required">*</em></label><div class="input-box"><div class="field-wrapper"><input type="text" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input" value="" class="input-text required-entry" /></div></div></div><div class="field input-postcode pcnl-input-housenumber"><label for="' + prefix + 'postcode_housenumber" class="required">'+ PCNLAPI_CONFIG.translations.houseNumberLabel +' <em class="required">*</em></label><div class="input-box"><div class="field-wrapper"><input type="text" title="'+ PCNLAPI_CONFIG.translations.houseNumberTitle +'" name="' + prefix + 'postcode_housenumber" id="' + prefix + 'postcode_housenumber" value="" class="input-text pcnl-input-text-half required-entry" /></div></div></div></li>'});
						if (!$(prefix +'postcode_input:checkbox'))
						{
							$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:checkbox" class="wide control pcnl-manual-checkbox"><div class="fields"><div class="input-box"><input type="checkbox" title="'+ PCNLAPI_CONFIG.translations.postcodeInputTitle +'" id="' + prefix + 'postcode_input_checkbox" value="" class="checkbox " /><label for="' + prefix + 'postcode_input_checkbox">'+ PCNLAPI_CONFIG.translations.manualInputText +'</label></div></div></li>'});

							$(prefix + 'postcode_input_checkbox').observe('click', function () { pcnlapi.toggleCountryPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4); });
						}
						$(prefix + street1).up('li').insert({before: '<li id="' + prefix + 'postcode_input:output" class="wide pcnl-hidden-field"><div><label>'+ PCNLAPI_CONFIG.translations.outputLabel +'</label><div id="' + prefix + 'postcode_output" class="pcnl-address-text"></div></div></li>'});
					}

					if (PCNLAPI_CONFIG.debug && window.console)
						console.log('Postcode.nl API enrich type: ' + this.enrichType);

					$(prefix +'postcode_input').observe('change', function(e) { pcnlapi.lookupPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4, e); });
					$(prefix +'postcode_housenumber').observe('change', function(e) { pcnlapi.lookupPostcode(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4, e); });
				}
				else
				{
					this.showFields([prefix +'postcode_input', prefix +'postcode_housenumber', prefix +'postcode_housenumber_addition', prefix + 'postcode_input:info-text', prefix + 'postcode_input_checkbox']);
				}

				this.observeImmediate(prefix, 'postcode_input');
				this.observeImmediate(prefix, 'postcode_housenumber');
				this.observeImmediate(prefix, 'postcode_input_checkbox');

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
						if (PCNLAPI_CONFIG.useStreet3AsHouseNumberAddition && $(prefix + street3))
						{
							housenumber = $(prefix + street2).getValue();
							housenumber_addition = $(prefix + street3).getValue();
						}
						else
						{
							housenumber_match = $(prefix + street2).getValue().match('^('+ this.REGEXP_HOUSENUMBER +')([^0-9a-zA-Z]*('+ this.REGEXP_HOUSENUMBER_ADDITION +'))?\\s*$');
							if (housenumber_match)
							{
								housenumber = housenumber_match[1].trim();
								housenumber_addition = housenumber_match[3] === undefined ? '' : housenumber_match[3].trim();
							}
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
		 * Try to see if our created fields need to be observed by the billing/shipping form
		 */
		observeImmediate: function(prefix, formElement)
		{
			var form;
			if (prefix.substring(0, 7) == 'billing' && (typeof billingForm != 'undefined'))
				form = billingForm;
			if (prefix.substring(0, 8) == 'shipping' && (typeof shippingForm != 'undefined'))
				form = shippingForm;

			if (!form || !form.validator.options.immediate)
				return;

			var input = $(prefix + formElement);

			if (input.tagName.toLowerCase() == 'select')
			{
				Event.observe(input, 'blur', form.validator.onChange.bindAsEventListener(form.validator));
			}
			if (input.type.toLowerCase() == 'radio' || input.type.toLowerCase() == 'checkbox')
			{
				Event.observe(input, 'click', form.validator.onChange.bindAsEventListener(form.validator));
			}
			else
			{
				Event.observe(input, 'change', form.validator.onChange.bindAsEventListener(form.validator));
			}
		},

		/**
		 * Toggle address field visibility, to be in line with the value of the 'manual input' checkbox.
		 */
		toggleAddressFields: function(prefix, postcodeFieldId, countryFieldId, street1, street2, street3, street4, values)
		{
			// Should not happen, but may occur if things go half-awry
			if (!$(prefix + 'postcode_input_checkbox'))
				return;

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

			this.observeImmediate(prefix, 'postcode_housenumber_addition');

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

					// Some extensions evade 'observe' by setting directly on elements when toggling shipping
					if ($('billing:country_id') && $('shipping:country_id'))
					{
						if ($('billing:use_for_shipping_yes'))
						{
							$('billing:use_for_shipping_yes').observe('click', function () {
								pcnlapi.toggleCountryPostcode('billing:', 'postcode', 'country_id', 'street1', 'street2', 'street3', 'street4');
								pcnlapi.toggleCountryPostcode('shipping:', 'postcode', 'country_id', 'street1', 'street2', 'street3', 'street4');
							});
						}
						if ($('billing:use_for_shipping_no'))
						{
							$('billing:use_for_shipping_no').observe('click', function () {
								pcnlapi.toggleCountryPostcode('billing:', 'postcode', 'country_id', 'street1', 'street2', 'street3', 'street4');
								pcnlapi.toggleCountryPostcode('shipping:', 'postcode', 'country_id', 'street1', 'street2', 'street3', 'street4');
							});
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
				var recursionDetection = false;
				this.observeAdminBillingAddress();
				this.observeAdminShippingAddress();

				if ($('order-data'))
				{
					$('order-data').observe('DOMNodeInserted', function(e) {
						if (event.target.nodeName == 'DIV')
						{
							if (!recursionDetection)
							{
								recursionDetection = true;
								pcnlapi.observeAdminBillingAddress();
								pcnlapi.observeAdminShippingAddress();
								recursionDetection = false;
							}
						}
					});
				}
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
		observeAdminBillingAddress: function ()
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

				// Use custom Magento 'changeUpdater' hook as well, because 'change' observe sometimes is not called...
				$('order-billing_address_country_id').changeUpdater = function ()
				{
					pcnlapi.toggleCountryPostcode('order-billing_address_', 'postcode', 'country_id', 'street0', 'street1', 'street2', 'street3');
				};
			}
		},
		observeAdminShippingAddress: function ()
		{
			var pcnlapi = this;
			// Shipping
			if (!$('order-shipping_as_billing').checked)
			{
				$('order-shipping_address_postcode').observe('change', function(e)
				{
					pcnlapi.lookupPostcode('order-shipping_address_', 'postcode', 'country_id', 'street0', 'street1', 'street2', 'street3', e);
				});
				$('order-shipping_address_country_id').observe('change', function () { pcnlapi.toggleCountryPostcode('order-shipping_address_', 'postcode', 'country_id', 'street0', 'street1', 'street2', 'street3'); });
				if ($('order-shipping_address_country_id').getValue() == 'NL')
					pcnlapi.toggleCountryPostcode('order-shipping_address_', 'postcode', 'country_id', 'street0', 'street1', 'street2', 'street3');

				// Use custom Magento 'changeUpdater' hook as well, because 'change' observe sometimes is not called...
				$('order-shipping_address_country_id').changeUpdater = function ()
				{
					pcnlapi.toggleCountryPostcode('order-shipping_address_', 'postcode', 'country_id', 'street0', 'street1', 'street2', 'street3');
				};
			}
		}
	};

	// Add observers to address fields on page
	PostcodeNl_Api.addAddressCheckObservers();
});

if (typeof PCNL_START != 'undefined')
	PCNL_START_FUNCTION();