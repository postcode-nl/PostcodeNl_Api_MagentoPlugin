<?php
class PostcodeNl_Api_Helper_Data extends Mage_Core_Helper_Abstract
{
	const API_TIMEOUT = 3;
	const API_URL = 'https://api.postcode.nl';

	protected $_modules = null;

	protected $_enrichType = 0;

	protected $_httpResponseRaw = null;
	protected $_httpResponseCode = null;
	protected $_httpResponseCodeClass = null;
	protected $_httpClientError = null;

	/**
	 * Get the html for initializing validation script.
	 *
	 * @param bool $getAdminConfig
	 *
	 * @return string
	 */
	public function getJsinit($getAdminConfig = false)
	{
		if ($getAdminConfig && $this->_getStoreConfig('postcodenl_api/advanced_config/admin_validation_disabled'))
			return '';

		$baseUrl = $this->_getMagentoLookupUrl($getAdminConfig);

		$html = '
			<script type="text/javascript">
			//<![CDATA[
				var PCNLAPI_CONFIG = {
					baseUrl: "' . htmlspecialchars($baseUrl) . '",
					useStreet2AsHouseNumber: ' . $this->_getConfigBoolString('postcodenl_api/advanced_config/use_street2_as_housenumber') . ',
					useStreet3AsHouseNumberAddition: ' . $this->_getConfigBoolString('postcodenl_api/advanced_config/use_street3_as_housenumber_addition') . ',
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

	/**
	 * Check if a specific service is enabled or not.
	 *
	 * @param string $service
	 *
	 * @return bool
	 */
	public function isApiEnabled($service)
	{
		// If we're debugging, assume all services are enabled, to get feedback on all levels.
		if ($this->_getStoreConfig('postcodenl_api/development_config/api_debug'))
			return true;

		if (!$this->_getStoreConfig('postcodenl_api/config/enabled'))
			return false;

		if ($service === 'Address' && !$this->_getStoreConfig('postcodenl_api/config/enabled_address_api'))
			return false;

		if ($service === 'Signal' && !$this->_getStoreConfig('postcodenl_api/config/enabled_signal_api'))
			return false;

		return true;
	}

	/**
	 * Check if we're currently in debug mode.
	 *
	 * @return bool
	 */
	public function isDebugging()
	{
		return (bool)$this->_getStoreConfig('postcodenl_api/development_config/api_debug');
	}

	/**
	 * Look information about a Dutch address by postcode, house number, and house number addition
	 *
	 * @param string $postcode
	 * @param string $houseNumber
	 * @param string $houseNumberAddition
	 *
	 * @return string
	 */
	public function lookupAddress($postcode, $houseNumber, $houseNumberAddition)
	{
		// Check if we are we enabled, configured & capable of handling an API request
		$message = $this->_checkApiReady('Address');
		if ($message)
			return $message;

		$response = array();

		// Some basic user data 'fixing', remove any not-letter, not-number characters
		$postcode = preg_replace('~[^a-z0-9]~i', '', $postcode);

		// Basic postcode format checking
		if (!preg_match('~^[0-9]{4}[a-z]{2}$~i', $postcode))
		{
			$response['message'] = $this->__('Invalid postcode format, use `1234AB` format.');
			$response['messageTarget'] = 'postcode';
			return $response;
		}

		$url = $this->_getServiceUrl() . '/rest/addresses/' . rawurlencode($postcode). '/'. rawurlencode($houseNumber) . '/'. rawurlencode($houseNumberAddition);

		$jsonData = $this->_callApiUrlGet($url);

		$serviceShowcase = $this->_getStoreConfig('postcodenl_api/development_config/api_showcase');
		$serviceDebug = $this->isDebugging();

		if ($serviceShowcase)
			$response['showcaseResponse'] = $jsonData;

		if ($serviceDebug)
		{
			$response['debugInfo'] = array(
				'requestUrl' => $url,
				'rawResponse' => $this->_httpResponseRaw,
				'parsedResponse' => $jsonData,
				'httpClientError' => $this->_httpClientError,
				'configuration' => array(
					'url' => $this->_getServiceUrl(),
					'key' => $this->_getKey(),
					'secret' => substr($this->_getSecret(), 0, 6) .'[hidden]',
					'showcase' => $serviceShowcase,
					'debug' => $serviceDebug,
				),
				'magentoVersion' => $this->_getMagentoVersion(),
				'extensionVersion' => $this->_getExtensionVersion(),
				'modules' => $this->_getMagentoModules(),
			);
		}

		if ($this->_httpResponseCode == 200 && is_array($jsonData) && isset($jsonData['postcode']))
		{
			$response = array_merge($response, $jsonData);
		}
		else if (is_array($jsonData) && isset($jsonData['exceptionId']))
		{
			if ($this->_httpResponseCode == 400 || $this->_httpResponseCode == 404)
			{
				switch ($jsonData['exceptionId'])
				{
					case 'PostcodeNl_Controller_Address_PostcodeTooShortException':
					case 'PostcodeNl_Controller_Address_PostcodeTooLongException':
					case 'PostcodeNl_Controller_Address_NoPostcodeSpecifiedException':
					case 'PostcodeNl_Controller_Address_InvalidPostcodeException':
						$response['message'] = $this->__('Invalid postcode format, use `1234AB` format.');
						$response['messageTarget'] = 'postcode';
						break;
					case 'PostcodeNl_Service_PostcodeAddress_AddressNotFoundException':
						$response['message'] = $this->__('Unknown postcode + housenumber combination.');
						$response['messageTarget'] = 'housenumber';
						break;
					case 'PostcodeNl_Controller_Address_InvalidHouseNumberException':
					case 'PostcodeNl_Controller_Address_NoHouseNumberSpecifiedException':
					case 'PostcodeNl_Controller_Address_NegativeHouseNumberException':
					case 'PostcodeNl_Controller_Address_HouseNumberTooLargeException':
					case 'PostcodeNl_Controller_Address_HouseNumberIsNotAnIntegerException':
						$response['message'] = $this->__('Housenumber format is not valid.');
						$response['messageTarget'] = 'housenumber';
						break;
					default:
						$response['message'] = $this->__('Incorrect address.');
						$response['messageTarget'] = 'housenumber';
						break;
				}
			}
			else if (is_array($jsonData) && isset($jsonData['exceptionId']))
			{
				$response['message'] = $this->__('Validation error, please use manual input.');
				$response['messageTarget'] = 'housenumber';
				$response['useManual'] = true;
			}
		}
		else
		{
			$response['message'] = $this->__('Validation unavailable, please use manual input.');
			$response['messageTarget'] = 'housenumber';
			$response['useManual'] = true;
		}

		return $response;
	}

	/**
	 * Set the enrichType number, or text/class description if not in known enrichType list
	 *
	 * @param mixed $enrichType
	 */
	public function setEnrichType($enrichType)
	{
		$this->_enrichType = preg_replace('~[^0-9a-z\-_,]~i', '', $enrichType);
		if (strlen($this->_enrichType) > 40)
			$this->_enrichType = substr($this->_enrichType, 0, 40);
	}

	/**
	 * Perform a Signal API check.
	 *
	 * @param array $signalCheck
	 *
	 * @return array Signal result
	 */
	public function checkSignal($signalCheck)
	{
		// Check if we are we enabled, configured & capable of handling an API request
		$message = $this->_checkApiReady('Signal');
		if ($message)
			return $message;

		$response = array();

		$url = $this->_getServiceUrl() . '/rest/signal/check';

		$jsonData = $this->_callApiUrlPostJson($url, $signalCheck);

		if ($this->_httpResponseCodeClass == 200 && is_array($jsonData))
		{
			$response = $jsonData;
		}
		else if (is_array($jsonData) && isset($jsonData['exceptionId']))
		{
			if ($this->_httpResponseCode == 401 || $this->_httpResponseCode == 403)
				$response['message'] = $this->__('Invalid Signal API authentication:') .' (`'. $this->_httpResponseCode .'`): ' . $jsonData['exception'];
			else if ($this->_httpResponseCodeClass == 400)
				$response['message'] = $this->__('Invalid Signal API input:') .' (`'. $this->_httpResponseCode .'`): ' . $jsonData['exception'];
			else
				$response['message'] = $this->__('Signal API error:') .' (`'. $this->_httpResponseCode .'`): '. $jsonData['exception'];
		}
		else
		{
			$response['message'] = $this->__('Signal API response not understood, service unavailable.') . 'HTTP status code: `'. $this->_httpResponseCode .'`';
		}
		return $response;
	}

	/**
	 * Split a housenumber addition from a housenumber.
	 * Examples: "123 2", "123 rood", "123a", "123a4", "123-a", "123 II"
	 * (the official notation is to separate the housenumber and addition with a single space)
	 *
	 * @param string $houseNumber Housenumber input
	 *
	 * @return array Split 'houseNumber' and 'houseNumberAddition'
	 */
	public function splitHouseNumber($houseNumber)
	{
		$houseNumberAddition = '';
		if (preg_match('~^(?<number>[0-9]+)(?:[^0-9a-zA-Z]+(?<addition1>[0-9a-zA-Z ]+)|(?<addition2>[a-zA-Z](?:[0-9a-zA-Z ]*)))?$~', $houseNumber, $match))
		{
			$houseNumber = $match['number'];
			$houseNumberAddition = isset($match['addition2']) ? $match['addition2'] : (isset($match['addition1']) ? $match['addition1'] : '');
		}

		return array($houseNumber, $houseNumberAddition);
	}

	/**
	 * Split a streename, housenumber and housenumber addition from a text lines containing a street and housenumber information.
	 *
	 * @param array $streetData Lines of steet data
	 *
	 * @return array Array containing 'street', 'houseNumber' and 'houseNumberAddition'
	 */
	public function splitStreetData($streetData)
	{
		$regexpStreet = '[^0-9].*?|.*?[^0-9]';
		$regexpHouseNumber = '[0-9]+';
		$regexpHouseNumberAddition = '[^\\s]+|[^\\s]\\s+[^\\s]{1,4}';

		if (preg_match('~^(?<street>'. $regexpStreet .')\s+(?<houseNumber>'. $regexpHouseNumber .')([^0-9a-zA-Z]*(?<houseNumberAddition>'. $regexpHouseNumberAddition .'))?\s*$~', $streetData[0], $match))
		{
			// Found housenumber contained in first street line
			return array(
				'street' => $match['street'],
				'houseNumber' => $match['houseNumber'],
				'houseNumberAddition' => $match['houseNumberAddition'],
			);
		}
		else if (isset($streetData[1]))
		{
			// Find housenumber contained in second street line

			$houseNumberData = $this->splitHouseNumber($streetData[1]);

			return array(
				'street' => $streetData[0],
				'houseNumber' => $houseNumberData[0],
				'houseNumberAddition' => $houseNumberData[1],
			);
		}
		else
		{
			return array(
				'street' => $streetData[0],
				'houseNumber' => null,
				'houseNumberAddition' => null,
			);
		}
	}

	/**
	 * Do a Postcode.nl Signal API check on a (newly created) Magento order.
	 * (called by hook class PostcodeNl_Api_Model_Observer)
	 * Will pass any information that can be used by the MijnPolitie.nl MIO Fraud Warning system
	 * (email, phonenumber), or Postcode.nl address validation (billing and delivery address).
	 * Also includes the order number, to be able to reference the Signal Check later.
	 *
	 * @param Mage_Sales_Model_Order $order
	 *
	 * @return array Signal data, or error with 'message' entry.
	 */
	public function checkOrderViaSignal($order)
	{
		// Check if we are we are enabled, configured & capable of handling an API request
		$message = $this->_checkApiReady('Signal');
		if ($message)
			return $message;

		// Housenumber data is often contained within the 'street' lines of the address.
		$billingStreetData = $this->splitStreetData($order->getBillingAddress()->getStreet());
		$shippingStreetData = $this->splitStreetData($order->getShippingAddress()->getStreet());

		// No customer might be available if this is an order status change
		$hasCustomer = ($order->getCustomer() !== null);

		// Only send phonenumber if it is at least 5 characters long
		$phoneNumber = Mage::helper('core/string')->strlen($order->getBillingAddress()->getTelephone()) >= 5 ? $order->getBillingAddress()->getTelephone() : null;

		$signalCheck = array(
			'customer' => array(
				'email' => $hasCustomer ? $order->getCustomer()->getEmail() : null,
				'phoneNumber' => $phoneNumber,
				'address' => array(
					'postcode' => $order->getBillingAddress()->getPostcode(),
					'houseNumber' => $billingStreetData['houseNumber'],
					'houseNumberAddition' => $billingStreetData['houseNumberAddition'],
					'street' => $billingStreetData['street'],
					'city' => $order->getBillingAddress()->getCity(),
					'region' => $order->getBillingAddress()->getRegion(),
					'country' => $order->getBillingAddress()->getCountryId(),
				),
			),
			'transaction' => array(
				'internalId' => $order->getIncrementId(),
				'deliveryAddress' =>  array(
					'postcode' => $order->getShippingAddress()->getPostcode(),
					'houseNumber' => $shippingStreetData['houseNumber'],
					'houseNumberAddition' => $shippingStreetData['houseNumberAddition'],
					'street' => $shippingStreetData['street'],
					'city' => $order->getShippingAddress()->getCity(),
					'region' => $order->getShippingAddress()->getRegion(),
					'country' => $order->getShippingAddress()->getCountryId(),
				),
			),
		);

		return $this->checkSignal($signalCheck);
	}

	protected function _getStoreConfig($path)
	{
		return Mage::getStoreConfig($path);
	}

	protected function _getKey()
	{
		return trim($this->_getStoreConfig('postcodenl_api/config/api_key'));
	}

	protected function _getSecret()
	{
		return trim($this->_getStoreConfig('postcodenl_api/config/api_secret'));
	}

	protected function _getServiceUrl()
	{
		$serviceUrl = trim($this->_getStoreConfig('postcodenl_api/development_config/api_url'));
		if (empty($serviceUrl))
			$serviceUrl = self::API_URL;

		return $serviceUrl;
	}

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
		$modules = $this->_getMagentoModules();

		if (!isset($modules[$moduleName]))
			return null;

		return $modules[$moduleName];
	}

	protected function _getConfigBoolString($configKey)
	{
		if ($this->_getStoreConfig($configKey))
			return 'true';

		return 'false';
	}

	protected function _getMagentoLookupUrl($inAdmin = false)
	{
		if ($inAdmin)
			return Mage::helper('adminhtml')->getUrl('*/pcnl/lookup', array('_secure' => true));
		else
			return Mage::getUrl('postcodenl_api/json', array('_secure' => true));
	}

	protected function _curlHasSsl()
	{
		$curlVersion = curl_version();
		return $curlVersion['features'] & CURL_VERSION_SSL;
	}

	protected function _checkApiReady($service = null)
	{
		if (!$this->_getStoreConfig('postcodenl_api/config/enabled'))
			return array('message' => $this->__('Postcode.nl API not enabled.'));;

		if ($this->_getServiceUrl() === '' || $this->_getKey() === '' || $this->_getSecret() === '')
			return array('message' => $this->__('Postcode.nl API not configured.'));

		if ($service === 'Address' && !$this->_getStoreConfig('postcodenl_api/config/enabled_address_api'))
			return array('message' => $this->__('Postcode.nl Address API not enabled.'));;

		if ($service === 'Signal' && !$this->_getStoreConfig('postcodenl_api/config/enabled_signal_api'))
			return array('message' => $this->__('Postcode.nl Signal API not enabled.'));;

		return $this->_checkCapabilities();
	}

	protected function _checkCapabilities()
	{
		// Check for SSL support in CURL
		if (!$this->_curlHasSsl())
			return array('message' => $this->__('Cannot connect to Postcode.nl API: Server is missing SSL (https) support for CURL.'));

		return false;
	}

	protected function _checkAddressApiReady()
	{
		if (!$this->_getStoreConfig('postcodenl_api/config/enabled_address_api'))
			return array('message' => $this->__('Postcode.nl Address API not enabled.'));;
	}

	protected function _callApiUrlGet($url)
	{
		$ch = curl_init();
		curl_setopt($ch, CURLOPT_URL, $url);
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
		curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, self::API_TIMEOUT);
		curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
		curl_setopt($ch, CURLOPT_USERPWD, $this->_getKey() .':'. $this->_getSecret());
		curl_setopt($ch, CURLOPT_USERAGENT, $this->_getUserAgent());
		$this->_httpResponseRaw = curl_exec($ch);
		$this->_httpResponseCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
		$this->_httpResponseCodeClass = (int)floor($this->_httpResponseCode / 100) * 100;
		$this->_httpClientError = curl_error($ch);

		curl_close($ch);

		return json_decode($this->_httpResponseRaw, true);
	}

	protected function _callApiUrlPostJson($url, $data)
	{
		$ch = curl_init();
		curl_setopt($ch, CURLOPT_URL, $url);
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
		curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, self::API_TIMEOUT);
		curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
		curl_setopt($ch, CURLOPT_USERPWD, $this->_getKey() .':'. $this->_getSecret());
		curl_setopt($ch, CURLOPT_USERAGENT, $this->_getUserAgent());
		curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
		curl_setopt($ch, CURLOPT_POST, true);
		curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
		$this->_httpResponseRaw = curl_exec($ch);
		$this->_httpResponseCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
		$this->_httpResponseCodeClass = (int)floor($this->_httpResponseCode / 100) * 100;
		$this->_httpClientError = curl_error($ch);
		curl_close($ch);

		return json_decode($this->_httpResponseRaw, true);
	}

	protected function _getExtensionVersion()
	{
		$extensionInfo = $this->_getModuleInfo('PostcodeNl_Api');
		return $extensionInfo ? (string)$extensionInfo['version'] : 'unknown';
	}

	protected function _getUserAgent()
	{
		return 'PostcodeNl_Api_MagentoPlugin/' . $this->_getExtensionVersion() .' '. $this->_getMagentoVersion() .' PHP/'. phpversion() .' EnrichType/'. $this->_enrichType;
	}

	protected function _getMagentoModules()
	{
		if ($this->_modules !== null)
			return $this->_modules;

		$this->_modules = array();
		foreach (Mage::getConfig()->getNode('modules')->children() as $name => $module)
		{
			$this->_modules[$name] = array();
			foreach ($module as $key => $value)
			{
				if (in_array((string)$key, array('active')))
					$this->_modules[$name][$key] = (string)$value == 'true' ? true : false;
				else if (in_array((string)$key, array('codePool', 'version')))
					$this->_modules[$name][$key] = (string)$value;
			}
		}
		return $this->_modules;
	}
}
