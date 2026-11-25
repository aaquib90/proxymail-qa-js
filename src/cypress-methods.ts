// The client methods cy.proxymail has (FM-15): every public method except
// forTest (each command already names its test), withAccount (its hooks are
// functions, which can't cross from the browser to Node), and a run's start,
// finish and results, which belong to the CI job or setupNodeEvents.
export const CYPRESS_METHODS = [
  'project',
  'updateProject',
  'customFields',
  'saveCustomField',
  'deleteCustomField',
  'setCustomFieldEnabled',
  'setStandardField',
  'sites',
  'addSite',
  'setMultiStep',
  'saveSignupScreen',
  'removeSignupScreen',
  'createAddress',
  'formValues',
  'listAddresses',
  'signInAccount',
  'totpCode',
  'listFormSections',
  'signupStarters',
  'getFormSection',
  'followsFormat',
  'signupForms',
  'signupForm',
  'saveSignupForm',
  'deleteSignupForm',
  'signupFormCode',
  'signupFormTest',
  'cleanupList',
  'journey',
  'markDevHost',
  'getAddress',
  'checkOutAccount',
  'extendCheckout',
  'returnAccount',
  'updateAddress',
  'deleteAddress',
  'markSubmitted',
  'waitForCode',
  'waitForLink',
  'messages',
  'countEmails',
  'checkEmail',
  'expectNoEmail',
  'markUnsubscribed',
  'markResubscribed',
  'checkUnsubscribe',
  'consent',
  'recordConsent',
  'recordCouponResult',
  'checkSequence',
  'offers',
  'checkDelivery',
  'variants',
  'nameVariants',
  'passwordVariants',
  'flowChecks',
  'setPassword',
  'savedPassword',
  'getRun',
  'runReport',
  'listRuns',
  'addRunNote',
] as const;

export type CypressMethod = (typeof CYPRESS_METHODS)[number];

// Left out on purpose; a test checks every public method is in one list.
export const NOT_IN_CYPRESS = ['forTest', 'withAccount', 'startRun', 'finishRun', 'recordTest', 'recordTestTotals'] as const;

// The task setupProxyMailQA registers and cy.proxymail calls.
export const CYPRESS_TASK = 'proxymail-qa';

export interface CypressTaskCall {
  method: string;
  args: unknown[];
  // The test's name, for the run's report.
  test?: string | null;
}
