<?php
class PostcodeNl_Api_Model_Observer
{
    public function adminConfigurationChanged(Varien_Event_Observer $observer)
    {
        $helper = Mage::helper('postcodenl_api');

        $data = $helper->testConnection();

        if ($data['status'] == 'error')
            Mage::getSingleton('core/session')->addError($helper->__('Postcode.nl API Test: '). $data['message']);
        if ($data['status'] == 'success')
            Mage::getSingleton('core/session')->addSuccess($helper->__('Postcode.nl API Test: '). $data['message']);

        if ($data['info'])
            Mage::getSingleton('core/session')->addNotice($helper->__('Postcode.nl API Test Troubleshooting: ') .'<br /><br />'. implode('<br />', $data['info']));
    }
}