<?php
class PostcodeNl_Api_Adminhtml_PcnlController extends Mage_Adminhtml_Controller_Action
{
    public function lookupAction()
    {
        /** @var PostcodeNl_Api_Helper_Data $helper */
        $helper = Mage::helper('postcodenl_api');

        if ($this->getRequest()->getParam('et'))
            $helper->setEnrichType($this->getRequest()->getParam('et'));

        $this->getResponse()->setHeader('Content-type', 'application/json', true);
        $this->getResponse()->setBody(
            json_encode(
                $helper->lookupAddress(
                    $this->getRequest()->getParam('postcode'),
                    $this->getRequest()->getParam('houseNumber'),
                    $this->getRequest()->getParam('houseNumberAddition')
                )
            )
        );
    }

    protected function _isAllowed()
    {
        // We allow all admins (regardless of specific rights) access, because we do not return any user data or
        // other potentially restricted data.
        return true;
    }
}
