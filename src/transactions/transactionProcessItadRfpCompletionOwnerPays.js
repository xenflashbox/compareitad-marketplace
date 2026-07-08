/**
 * Transaction process graph for ITAD RFP completion, owner-pays pattern:
 *   - itad-rfp-completion-owner-pays
 *
 * The seller (asset owner, customer role) pays the winning vendor
 * (provider role) for disposition services. Funds are escrowed on
 * checkout and released when the seller accepts the completed service,
 * the 5-day acceptance window lapses, or operator mediation resolves
 * in the vendor's favor.
 */

/**
 * Transitions
 *
 * These strings must sync with values defined in Marketplace API,
 * since transaction objects given by API contain info about last transitions.
 * All the actions in API side happen in transitions,
 * so we need to understand what those strings mean.
 */

export const transitions = {
  // Seller initiates checkout for the winning bid's vendor-service-package
  // listing. Line items are set server-side from the confirmed bid terms,
  // and a PaymentIntent is created by Marketplace API.
  REQUEST_PAYMENT: 'transition/request-payment',

  // Stripe SDK might need to ask 3D security from customer, in a separate front-end step.
  // Therefore we need to make another transition to Marketplace API,
  // to tell that the payment is confirmed. Payment is captured immediately
  // into escrow.
  CONFIRM_PAYMENT: 'transition/confirm-payment',

  // If the payment is not confirmed in the time limit set in transaction process (by default 15min)
  // the transaction will expire automatically.
  EXPIRE_PAYMENT: 'transition/expire-payment',

  // Vendor confirms asset receipt; chain-of-custody begins.
  MARK_SERVICE_IN_PROGRESS: 'transition/mark-service-in-progress',
  OPERATOR_MARK_SERVICE_IN_PROGRESS: 'transition/operator-mark-service-in-progress',

  // Vendor marks the service complete; certificate of destruction issued;
  // the seller's 5-day acceptance window starts.
  MARK_SERVICE_COMPLETED: 'transition/mark-service-completed',
  OPERATOR_MARK_SERVICE_COMPLETED: 'transition/operator-mark-service-completed',

  // Seller accepts completion — escrowed funds release to the vendor.
  ACCEPT: 'transition/accept',
  OPERATOR_ACCEPT: 'transition/operator-accept',

  // Acceptance window lapses without objection — funds release automatically.
  AUTO_ACCEPT: 'transition/auto-accept',

  // Seller raises an issue inside the acceptance window — operator mediation begins.
  DISPUTE: 'transition/dispute',
  OPERATOR_DISPUTE: 'transition/operator-dispute',

  // Mediation outcomes: release funds to the vendor, or refund the seller.
  RESOLVE_RELEASE: 'transition/resolve-release',
  RESOLVE_REFUND: 'transition/resolve-refund',

  // Operator cancellation before completion — full refund to the seller.
  CANCEL: 'transition/cancel',
  CANCEL_FROM_SERVICE_IN_PROGRESS: 'transition/cancel-from-service-in-progress',
};

/**
 * States
 *
 * These constants are only for making it clear how transitions work together.
 * You should not use these constants outside of this file.
 *
 * Note: these states are not in sync with states used transaction process definitions
 *       in Marketplace API. Only last transitions are passed along transaction object.
 */

export const states = {
  INITIAL: 'initial',
  PENDING_PAYMENT: 'pending-payment',
  PAYMENT_EXPIRED: 'payment-expired',
  FUNDS_IN_ESCROW: 'funds-in-escrow',
  SERVICE_IN_PROGRESS: 'service-in-progress',
  SERVICE_COMPLETED: 'service-completed',
  ACCEPTED: 'accepted',
  DISPUTED: 'disputed',
  REFUNDED: 'refunded',
  CANCELED: 'canceled',
};

/**
 * Description of transaction process graph
 *
 * You should keep this in sync with transaction process defined in Marketplace API
 *
 * Note: we don't use yet any state machine library,
 *       but this description format is following Xstate (FSM library)
 *       https://xstate.js.org/docs/
 */
export const graph = {
  // id is defined only to support Xstate format.
  // However if you have multiple transaction processes defined,
  // it is best to keep them in sync with transaction process aliases.
  id: 'itad-rfp-completion-owner-pays/release-1',

  // This 'initial' state is a starting point for new transaction
  initial: states.INITIAL,

  // States
  states: {
    [states.INITIAL]: {
      on: {
        [transitions.REQUEST_PAYMENT]: states.PENDING_PAYMENT,
      },
    },

    [states.PENDING_PAYMENT]: {
      on: {
        [transitions.EXPIRE_PAYMENT]: states.PAYMENT_EXPIRED,
        [transitions.CONFIRM_PAYMENT]: states.FUNDS_IN_ESCROW,
      },
    },

    [states.PAYMENT_EXPIRED]: {},

    [states.FUNDS_IN_ESCROW]: {
      on: {
        [transitions.MARK_SERVICE_IN_PROGRESS]: states.SERVICE_IN_PROGRESS,
        [transitions.OPERATOR_MARK_SERVICE_IN_PROGRESS]: states.SERVICE_IN_PROGRESS,
        [transitions.CANCEL]: states.CANCELED,
      },
    },

    [states.SERVICE_IN_PROGRESS]: {
      on: {
        [transitions.MARK_SERVICE_COMPLETED]: states.SERVICE_COMPLETED,
        [transitions.OPERATOR_MARK_SERVICE_COMPLETED]: states.SERVICE_COMPLETED,
        [transitions.CANCEL_FROM_SERVICE_IN_PROGRESS]: states.CANCELED,
      },
    },

    [states.SERVICE_COMPLETED]: {
      on: {
        [transitions.ACCEPT]: states.ACCEPTED,
        [transitions.OPERATOR_ACCEPT]: states.ACCEPTED,
        [transitions.AUTO_ACCEPT]: states.ACCEPTED,
        [transitions.DISPUTE]: states.DISPUTED,
        [transitions.OPERATOR_DISPUTE]: states.DISPUTED,
      },
    },

    [states.DISPUTED]: {
      on: {
        [transitions.RESOLVE_RELEASE]: states.ACCEPTED,
        [transitions.RESOLVE_REFUND]: states.REFUNDED,
      },
    },

    [states.ACCEPTED]: { type: 'final' },
    [states.REFUNDED]: { type: 'final' },
    [states.CANCELED]: { type: 'final' },
  },
};

// Check if a transition is the kind that should be rendered
// when showing transition history (e.g. ActivityFeed)
// The first transition and most of the expiration transitions made by system are not relevant
export const isRelevantPastTransition = transition => {
  return [
    transitions.CONFIRM_PAYMENT,
    transitions.MARK_SERVICE_IN_PROGRESS,
    transitions.OPERATOR_MARK_SERVICE_IN_PROGRESS,
    transitions.MARK_SERVICE_COMPLETED,
    transitions.OPERATOR_MARK_SERVICE_COMPLETED,
    transitions.ACCEPT,
    transitions.OPERATOR_ACCEPT,
    transitions.AUTO_ACCEPT,
    transitions.DISPUTE,
    transitions.OPERATOR_DISPUTE,
    transitions.RESOLVE_RELEASE,
    transitions.RESOLVE_REFUND,
    transitions.CANCEL,
    transitions.CANCEL_FROM_SERVICE_IN_PROGRESS,
  ].includes(transition);
};

// This process has no review transitions (v1).
export const isCustomerReview = transition => {
  return false;
};

export const isProviderReview = transition => {
  return false;
};

// Check if the given transition is privileged.
//
// Privileged transitions need to be handled from a secure context,
// i.e. the backend. This helper is used to check if the transition
// should go through the local API endpoints, or if using JS SDK is
// enough.
export const isPrivileged = transition => {
  return [transitions.REQUEST_PAYMENT].includes(transition);
};

// Check when transaction is completed (escrowed funds released to the vendor)
export const isCompleted = transition => {
  const txCompletedTransitions = [
    transitions.ACCEPT,
    transitions.OPERATOR_ACCEPT,
    transitions.AUTO_ACCEPT,
    transitions.RESOLVE_RELEASE,
  ];
  return txCompletedTransitions.includes(transition);
};

// Check when transaction is refunded (service did not complete acceptably)
// In these transitions action/stripe-refund-payment is called
export const isRefunded = transition => {
  const txRefundedTransitions = [
    transitions.EXPIRE_PAYMENT,
    transitions.RESOLVE_REFUND,
    transitions.CANCEL,
    transitions.CANCEL_FROM_SERVICE_IN_PROGRESS,
  ];
  return txRefundedTransitions.includes(transition);
};

export const statesNeedingProviderAttention = [
  states.FUNDS_IN_ESCROW,
  states.SERVICE_IN_PROGRESS,
];

export const statesNeedingCustomerAttention = [states.SERVICE_COMPLETED];
