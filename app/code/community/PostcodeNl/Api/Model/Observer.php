<?php
class PostcodeNl_Api_Model_Observer
{
	/**
	* Event Hook: checkout_submit_all_after
	* @param Varien_Event_Observer $observer
	*/
	public function signalObserveOrderCreation(Varien_Event_Observer $observer)
	{
		$helper = Mage::helper('postcodenl_api');

		if (!$helper->isApiEnabled('Signal'))
			return;

		$order = $observer->getEvent()->getOrder();

		$result = $helper->checkOrderViaSignal($order);

		// Can't return errors/messages in hook, so log errors.
		if (isset($result['message']))
		{
			Mage::log('Order #'. $order->getIncrementId() .' signalObserveOrderCreation failed: '. $result['message'], Zend_Log::ERR, 'postcodenl-signal.log', true);
		}
		else if ($helper->isDebugging())
		{
			Mage::log('Order #'. $order->getIncrementId() .' signalObserveOrderCreation called. '. $result['warningCount'] .' Signal warnings, report: '. $result['reportPdfUrl'], Zend_Log::DEBUG, 'postcodenl-signal.log', true);
		}
	}
}