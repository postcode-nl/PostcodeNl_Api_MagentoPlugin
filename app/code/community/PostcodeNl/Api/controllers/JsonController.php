<?php
class PostcodeNl_Api_JsonController extends Mage_Core_Controller_Front_Action
{
	const API_TIMEOUT = 3;

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

	public function lookupAction()
	{
		if (!Mage::getStoreConfig('postcodenl/config/enabled'))
		{
			echo json_encode(array('message' => $this->__('Postcode.nl API not enabled.')));
			return;
		}

		$serviceUrl = trim(Mage::getStoreConfig('postcodenl/config/api_url'));
		$serviceKey = trim(Mage::getStoreConfig('postcodenl/config/api_key'));
		$serviceSecret = trim(Mage::getStoreConfig('postcodenl/config/api_secret'));
		$serviceShowcase = Mage::getStoreConfig('postcodenl/config/api_showcase');
		$serviceDebug = Mage::getStoreConfig('postcodenl/config/api_debug');

		$extensionInfo = $this->_getModuleInfo('PostcodeNl_Api');
		$extensionVersion = $extensionInfo ? (string)$extensionInfo->version : 'unknown';

		if (!$serviceUrl || !$serviceKey || !$serviceSecret)
		{
			echo json_encode(array('message' => $this->__('Postcode.nl API not configured.')));
			return;
		}

		$url = $serviceUrl . '/rest/addresses/' . urlencode($_GET['postcode']). '/'. urlencode($_GET['houseNumber']) . '/'. urlencode($_GET['houseNumberAddition']);
		$ch = curl_init();
		curl_setopt($ch, CURLOPT_URL, $url);
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
		curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, self::API_TIMEOUT);
		curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_ANY);
		curl_setopt($ch, CURLOPT_USERPWD, $serviceKey .':'. $serviceSecret);
		curl_setopt($ch, CURLOPT_USERAGENT, 'PostcodeNl_Api_MagentoPlugin/' . $extensionVersion .' '. $this->_getMagentoVersion());
		$jsonResponse = curl_exec($ch);
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
				'curlError' => curl_error($ch),
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
				case 'PostcodeNl_Controller_Address_InvalidPostcodeException':
					$sendResponse['message'] = $this->__('Invalid postcode format, use `1234AB` format.');
					$sendResponse['messageTarget'] = 'postcode';
					break;
				case 'PostcodeNl_Service_PostcodeAddress_AddressNotFoundException':
					$sendResponse['message'] = $this->__('Unknown postcode + housenumber combination.');
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
		echo json_encode($sendResponse);
	}
}
