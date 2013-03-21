<?php
class PostcodeNl_Api_Adminhtml_PcnlController extends Mage_Adminhtml_Controller_Action
{
	public function lookupAction()
	{
		$helper = Mage::helper('postcodenl_api');

		$this->getResponse()->setHeader('Content-type', 'application/json');
		$this->getResponse()->setBody(json_encode($helper->lookupAddress(
			$this->getRequest()->getParam('postcode'),
			$this->getRequest()->getParam('houseNumber'),
			$this->getRequest()->getParam('houseNumberAddition')
		)));
	}
}
