<?php
$config = new Mage_Core_Model_Config();

// Look up old config data
$serviceEnabled = trim(Mage::getStoreConfig('postcodenl/config/enabled'));
$serviceUrl = trim(Mage::getStoreConfig('postcodenl/config/api_url'));
$serviceKey = trim(Mage::getStoreConfig('postcodenl/config/api_key'));
$serviceSecret = trim(Mage::getStoreConfig('postcodenl/config/api_secret'));
$serviceShowcase = Mage::getStoreConfig('postcodenl/config/api_showcase');
$serviceDebug = Mage::getStoreConfig('postcodenl/config/api_debug');
$serviceNeverHideCountry = Mage::getStoreConfig('postcodenl/config/never_hide_country');
$serviceUseStreet2AsHousenumber = Mage::getStoreConfig('postcodenl/config/use_street2_as_housenumber');

// Only do update, if we actually have old configuration (secret being most important to check)
if ($serviceSecret !== null)
{
	// Set new basic configuration
	$config->saveConfig('postcodenl_api/config/enabled', $serviceEnabled, 'default', 0);
	$config->saveConfig('postcodenl_api/config/api_key', $serviceKey, 'default', 0);
	$config->saveConfig('postcodenl_api/config/api_secret', $serviceSecret, 'default', 0);

	// Set new advanced configuration
	$config->saveConfig('postcodenl_api/advanced_config/use_street2_as_housenumber', $serviceUseStreet2AsHousenumber, 'default', 0);
	$config->saveConfig('postcodenl_api/advanced_config/never_hide_country', $serviceNeverHideCountry, 'default', 0);

	// Set new development configuration
	$config->saveConfig('postcodenl_api/development_config/api_url', $serviceUrl, 'default', 0);
	$config->saveConfig('postcodenl_api/development_config/api_debug', $serviceDebug, 'default', 0);
	$config->saveConfig('postcodenl_api/development_config/api_showcase', $serviceShowcase, 'default', 0);
}

// Delete old configuration
$config->deleteConfig('postcodenl/config/enabled', 'default', 0);
$config->deleteConfig('postcodenl/config/api_url', 'default', 0);
$config->deleteConfig('postcodenl/config/api_key', 'default', 0);
$config->deleteConfig('postcodenl/config/api_secret', 'default', 0);
$config->deleteConfig('postcodenl/config/api_showcase', 'default', 0);
$config->deleteConfig('postcodenl/config/api_debug', 'default', 0);
$config->deleteConfig('postcodenl/config/never_hide_country', 'default', 0);
$config->deleteConfig('postcodenl/config/use_street2_as_housenumber', 'default', 0);
