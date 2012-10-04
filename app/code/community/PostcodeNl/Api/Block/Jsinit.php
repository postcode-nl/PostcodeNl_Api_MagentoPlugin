<?php
class PostcodeNl_Api_Block_Jsinit extends Mage_Core_Block_Template
{
	protected function _toHtml()
	{
		if (is_link(dirname(Mage::getModuleDir('', 'PostcodeNl_Api'))) && !Mage::getStoreConfig('dev/template/allow_symlink'))
		{
			throw new Mage_Core_Exception('Postcode.nl API Development: Symlinks not enabled! (set at Admin->System->Configuration->Advanced->Developer->Template Settings)');
		}

		return parent::_toHtml();
	}
}
