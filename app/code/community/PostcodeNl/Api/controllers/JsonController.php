<?php
class PostcodeNl_Api_JsonController extends Mage_Core_Controller_Front_Action
{
	public function lookupAction()
	{
		$helper = new PostcodeNl_Api_Helper_Data();
		echo json_encode($helper->lookupAddress($_GET['postcode'], $_GET['houseNumber'], $_GET['houseNumberAddition']));
		return;
	}
}
