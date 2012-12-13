<?php
class PostcodeNl_Api_Adminhtml_PcnlController extends Mage_Adminhtml_Controller_Action
{
	public function lookupAction()
	{
		$helper = new PostcodeNl_Api_Helper_Data();

		$this->getResponse()->setHeader('Content-type', 'application/json');
        $this->getResponse()->setBody(json_encode($helper->lookupAddress($_GET['postcode'], $_GET['houseNumber'], $_GET['houseNumberAddition'])));
	}
}
