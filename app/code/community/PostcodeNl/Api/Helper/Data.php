<?php
class PostcodeNl_Api_Helper_Data extends Mage_Core_Helper_Abstract
{
	const API_TIMEOUT = 3;
	const API_URL = 'https://api.postcode.nl';

	protected $_modules;

	protected function _getMagentoVersion()
	{
		if ($this->_getModuleInfo('Enterprise_CatalogPermissions') !== null)
		{
			// Detect enterprise
			return 'MagentoEnterprise/'. Mage::getVersion();
		}
		elseif ($this->_getModuleInfo('Enterprise_Enterprise') !== null)
		{
			// Detect professional
			return 'MagentoProfessional/'. Mage::getVersion();
		}
		else
		{
			// Rest
			return 'Magento/'. Mage::getVersion();
		}
	}

	protected function _getModuleInfo($moduleName)
	{
		if (!isset($this->_modules))
			$this->_modules = (array)Mage::getConfig()->getNode('modules')->children();

		if (!isset($this->_modules[$moduleName]))
			return null;

		return $this->_modules[$moduleName];
	}

	protected function _getConfigBoolString($configKey)
	{
		if (Mage::getStoreConfig($configKey))
			return 'true';

		return 'false';
	}

	/**
	 * Get the html for initializing validation script.
	 *
	 * @return string
	 */
	public function getJsinit($getAdminConfig = false)
	{
		if ($getAdminConfig && Mage::getStoreConfig('postcodenl_api/advanced_config/admin_validation_disabled'))
			return '';

		if ($getAdminConfig)
			$baseUrl = Mage::helper('adminhtml')->getUrl('*/pcnl/lookup', array('_secure' => true));
		else
			$baseUrl = Mage::getUrl('postcodenl_api/json', array('_secure' => true));

		$html = '
			<script type="text/javascript">
			//<![CDATA[
				var PCNLAPI_CONFIG = {
					baseUrl: "' . htmlspecialchars($baseUrl) . '",
					useStreet2AsHouseNumber: ' . $this->_getConfigBoolString('postcodenl_api/advanced_config/use_street2_as_housenumber') . ',
					blockPostOfficeBoxAddresses: '. $this->_getConfigBoolString('postcodenl_api/advanced_config/block_postofficeboxaddresses') . ',
					neverHideCountry: ' . $this->_getConfigBoolString('postcodenl_api/advanced_config/never_hide_country') . ',
					showcase: ' . $this->_getConfigBoolString('postcodenl_api/development_config/api_showcase') . ',
					debug: ' . $this->_getConfigBoolString('postcodenl_api/development_config/api_debug') . ',
					translations: {
						defaultError: "' . htmlspecialchars($this->__('Unknown postcode + housenumber combination.')) . '",
						postcodeInputLabel: "' . htmlspecialchars($this->__('Postcode')) . '",
						postcodeInputTitle: "' . htmlspecialchars($this->__('Postcode')) . '",
						houseNumberAdditionUnknown: "' . htmlspecialchars($this->__('Housenumber addition `{addition}` is unknown.')) . '",
						houseNumberAdditionRequired: "' . htmlspecialchars($this->__('Housenumber addition required.')) . '",
						houseNumberLabel: "' . htmlspecialchars($this->__('Housenumber')) . '",
						houseNumberTitle: "' . htmlspecialchars($this->__('Housenumber')) . '",
						houseNumberAdditionLabel: "' . htmlspecialchars($this->__('Housenumber addition')) . '",
						houseNumberAdditionTitle: "' . htmlspecialchars($this->__('Housenumber addition')) . '",
						selectAddition: "' . htmlspecialchars($this->__('Select...')) . '",
						noAdditionSelect: "' . htmlspecialchars($this->__('No addition.')) . '",
						noAdditionSelectCustom: "' . htmlspecialchars($this->__('`No addition`')) . '",
						additionSelectCustom: "' . htmlspecialchars($this->__('`{addition}`')) . '",
						apiShowcase: "' . htmlspecialchars($this->__('API Showcase')) . '",
						apiDebug: "' . htmlspecialchars($this->__('API Debug')) . '",
						disabledText: "' . htmlspecialchars($this->__('- disabled -')) . '",
						infoLabel: "' . htmlspecialchars($this->__('Address validation')) . '",
						infoText: "' . htmlspecialchars($this->__('Fill out your postcode and housenumber to auto-complete your address. You can also manually set your address information.')) . '",
						manualInputLabel: "' . htmlspecialchars($this->__('Manual input')) . '",
						manualInputText: "' . htmlspecialchars($this->__('Fill out address information manually')) . '",
						outputLabel: "' . htmlspecialchars($this->__('Validated address')) . '",
						postOfficeBoxNotAllowed: "' . htmlspecialchars($this->__('Post office box not allowed.')) . '"
					}
				};
			//]]>
			</script>';

		return $html;
	}

	public function lookupAddress($postcode, $houseNumber, $houseNumberAddition)
	{
		if (!Mage::getStoreConfig('postcodenl_api/config/enabled'))
		{
			return array('message' => $this->__('Postcode.nl API not enabled.'));
		}

		// Basic Configuration
		$serviceKey = trim(Mage::getStoreConfig('postcodenl_api/config/api_key'));
		$serviceSecret = trim(Mage::getStoreConfig('postcodenl_api/config/api_secret'));
		// Development options
		$serviceUrl = trim(Mage::getStoreConfig('postcodenl_api/development_config/api_url'));
		if (empty($serviceUrl))
			$serviceUrl = self::API_URL;

		$serviceShowcase = Mage::getStoreConfig('postcodenl_api/development_config/api_showcase');
		$serviceDebug = Mage::getStoreConfig('postcodenl_api/development_config/api_debug');

		$extensionInfo = $this->_getModuleInfo('PostcodeNl_Api');
		$extensionVersion = $extensionInfo ? (string)$extensionInfo->version : 'unknown';

		if (!$serviceUrl || !$serviceKey || !$serviceSecret)
		{
			return array('message' => $this->__('Postcode.nl API not configured.'));
		}

		// Check for SSL support in CURL, if connecting to `https`
		if (substr($serviceUrl, 0, 8) == 'https://')
		{
			$curlVersion = curl_version();
			if (!($curlVersion['features'] & CURL_VERSION_SSL))
			{
				return array('message' => $this->__('Cannot connect to Postcode.nl API: Server is missing SSL (https) support for CURL.'));
			}
		}

		// Some basic user data 'fixing', remove any not-letter, not-number characters
		$postcode = preg_replace('~[^a-z0-9]~i', '', $postcode);

		// Basic postcode format checking
		if (!preg_match('~^[0-9]{4}[a-z]{2}$~i', $postcode))
		{
			$sendResponse = array();
			$sendResponse['message'] = $this->__('Invalid postcode format, use `1234AB` format.');
			$sendResponse['messageTarget'] = 'postcode';
			return $sendResponse;
		}

		$url = $serviceUrl . '/rest/addresses/' . urlencode($postcode). '/'. urlencode($houseNumber) . '/'. urlencode($houseNumberAddition);
		$ch = curl_init();
		curl_setopt($ch, CURLOPT_URL, $url);
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
		curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, self::API_TIMEOUT);
		curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
		curl_setopt($ch, CURLOPT_USERPWD, $serviceKey .':'. $serviceSecret);
		curl_setopt($ch, CURLOPT_USERAGENT, 'PostcodeNl_Api_MagentoPlugin/' . $extensionVersion .' '. $this->_getMagentoVersion() .' PHP/'. phpversion());
		$jsonResponse = curl_exec($ch);
		$curlError = curl_error($ch);
		curl_close($ch);

		$response = json_decode($jsonResponse, true);

		$sendResponse = array();
		if ($serviceShowcase)
			$sendResponse['showcaseResponse'] = $response;

		if ($serviceDebug)
		{
			$modules = array();
			foreach (Mage::getConfig()->getNode('modules')->children() as $name => $module)
			{
				$modules[$name] = array();
				foreach ($module as $key => $value)
				{
					if (in_array((string)$key, array('active')))
						$modules[$name][$key] = (string)$value == 'true' ? true : false;
					else if (in_array((string)$key, array('codePool', 'version')))
						$modules[$name][$key] = (string)$value;
				}
			}

			$sendResponse['debugInfo'] = array(
				'requestUrl' => $url,
				'rawResponse' => $jsonResponse,
				'parsedResponse' => $response,
				'curlError' => $curlError,
				'configuration' => array(
					'url' => $serviceUrl,
					'key' => $serviceKey,
					'secret' => substr($serviceSecret, 0, 6) .'[hidden]',
					'showcase' => $serviceShowcase,
					'debug' => $serviceDebug,
				),
				'magentoVersion' => $this->_getMagentoVersion(),
				'extensionVersion' => $extensionVersion,
				'modules' => $modules,
			);
		}

		if (is_array($response) && isset($response['exceptionId']))
		{
			switch ($response['exceptionId'])
			{
				case 'PostcodeNl_Controller_Address_PostcodeTooShortException':
				case 'PostcodeNl_Controller_Address_PostcodeTooLongException':
				case 'PostcodeNl_Controller_Address_NoPostcodeSpecifiedException':
				case 'PostcodeNl_Controller_Address_InvalidPostcodeException':
					$sendResponse['message'] = $this->__('Invalid postcode format, use `1234AB` format.');
					$sendResponse['messageTarget'] = 'postcode';
					break;
				case 'PostcodeNl_Service_PostcodeAddress_AddressNotFoundException':
					$sendResponse['message'] = $this->__('Unknown postcode + housenumber combination.');
					$sendResponse['messageTarget'] = 'housenumber';
					break;
				case 'PostcodeNl_Controller_Address_InvalidHouseNumberException':
				case 'PostcodeNl_Controller_Address_NoHouseNumberSpecifiedException':
				case 'PostcodeNl_Controller_Address_NegativeHouseNumberException':
				case 'PostcodeNl_Controller_Address_HouseNumberTooLargeException':
				case 'PostcodeNl_Controller_Address_HouseNumberIsNotAnIntegerException':
					$sendResponse['message'] = $this->__('Housenumber format is not valid.');
					$sendResponse['messageTarget'] = 'housenumber';
					break;
				default:
					$sendResponse['message'] = $this->__('Validation error, please use manual input.');
					$sendResponse['messageTarget'] = 'housenumber';
					break;
			}
		}
		else if (is_array($response) && isset($response['postcode']))
		{
			$sendResponse = array_merge($sendResponse, $response);
		}
		else
		{
			$sendResponse['message'] = $this->__('Validation unavailable, please use manual input.');
			$sendResponse['messageTarget'] = 'housenumber';
		}
		return $sendResponse;
	}
}
