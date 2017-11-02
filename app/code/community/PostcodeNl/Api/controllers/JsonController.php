<?php
class PostcodeNl_Api_JsonController extends Mage_Core_Controller_Front_Action
{
    public function lookupAction()
    {
        /* @var $helper PostcodeNl_Api_Helper_Data */
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
}
