//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ExamplePredictionMarket
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const examplePredictionMarketAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'settlerAddress', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'error',
    inputs: [
      {
        name: 'current',
        internalType: 'enum ExamplePredictionMarket.Status',
        type: 'uint8',
      },
    ],
    name: 'AlreadySettled',
  },
  { type: 'error', inputs: [], name: 'AmountZero' },
  { type: 'error', inputs: [], name: 'DurationZero' },
  {
    type: 'error',
    inputs: [
      { name: 'nowTs', internalType: 'uint256', type: 'uint256' },
      { name: 'closeTs', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'EventNotClosed',
  },
  {
    type: 'error',
    inputs: [
      { name: 'nowTs', internalType: 'uint256', type: 'uint256' },
      { name: 'closeTs', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'EventNotOpen',
  },
  { type: 'error', inputs: [], name: 'InvalidOutcome' },
  { type: 'error', inputs: [], name: 'LiquidityAlreadyWithdrawn' },
  {
    type: 'error',
    inputs: [
      {
        name: 'current',
        internalType: 'enum ExamplePredictionMarket.Status',
        type: 'uint8',
      },
    ],
    name: 'ManualSettlementNotAllowed',
  },
  { type: 'error', inputs: [], name: 'NotCreator' },
  {
    type: 'error',
    inputs: [
      {
        name: 'current',
        internalType: 'enum ExamplePredictionMarket.Status',
        type: 'uint8',
      },
    ],
    name: 'NotSettledYet',
  },
  { type: 'error', inputs: [], name: 'NotSettler' },
  {
    type: 'error',
    inputs: [{ name: 'owner', internalType: 'address', type: 'address' }],
    name: 'OwnableInvalidOwner',
  },
  {
    type: 'error',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'OwnableUnauthorizedAccount',
  },
  {
    type: 'error',
    inputs: [{ name: 'token', internalType: 'address', type: 'address' }],
    name: 'SafeERC20FailedOperation',
  },
  {
    type: 'error',
    inputs: [
      {
        name: 'current',
        internalType: 'enum ExamplePredictionMarket.Status',
        type: 'uint8',
      },
    ],
    name: 'SettlementNotRequested',
  },
  {
    type: 'error',
    inputs: [
      {
        name: 'current',
        internalType: 'enum ExamplePredictionMarket.Status',
        type: 'uint8',
      },
    ],
    name: 'StatusNotOpen',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'eventId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'EventAdminClosed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'eventId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'creator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'question',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
      {
        name: 'eventOpen',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'eventClose',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'duration',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'yesToken',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'noToken',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
    ],
    name: 'EventCreated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'eventId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'creator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'usdcOut',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'LiquidityWithdrawn',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferred',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'eventId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'question',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
    ],
    name: 'SettlementRequested',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'eventId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'status',
        internalType: 'enum ExamplePredictionMarket.Status',
        type: 'uint8',
        indexed: true,
      },
      {
        name: 'outcome',
        internalType: 'enum ExamplePredictionMarket.Outcome',
        type: 'uint8',
        indexed: true,
      },
    ],
    name: 'SettlementResponse',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousSettler',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newSettler',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'SettlerUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'eventId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'buyer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'outcome',
        internalType: 'enum ExamplePredictionMarket.Outcome',
        type: 'uint8',
        indexed: true,
      },
      {
        name: 'usdcIn',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'sharesOut',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'SharesPurchased',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'eventId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'redeemer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'sharesIn',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'usdcOut',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'SharesRedeemed',
  },
  {
    type: 'function',
    inputs: [],
    name: 'INITIAL_LIQUIDITY',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'eventId', internalType: 'uint256', type: 'uint256' }],
    name: 'adminCloseEvent',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'eventId', internalType: 'uint256', type: 'uint256' },
      {
        name: 'outcome',
        internalType: 'enum ExamplePredictionMarket.Outcome',
        type: 'uint8',
      },
      { name: 'usdcAmount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'buyShares',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    name: 'events',
    outputs: [
      { name: 'question', internalType: 'string', type: 'string' },
      { name: 'creator', internalType: 'address', type: 'address' },
      { name: 'eventOpen', internalType: 'uint256', type: 'uint256' },
      { name: 'eventClose', internalType: 'uint256', type: 'uint256' },
      {
        name: 'status',
        internalType: 'enum ExamplePredictionMarket.Status',
        type: 'uint8',
      },
      {
        name: 'outcome',
        internalType: 'enum ExamplePredictionMarket.Outcome',
        type: 'uint8',
      },
      { name: 'settledAt', internalType: 'uint256', type: 'uint256' },
      { name: 'evidenceURI', internalType: 'string', type: 'string' },
      { name: 'confidenceBps', internalType: 'uint16', type: 'uint16' },
      {
        name: 'yesToken',
        internalType: 'contract ExamplePredictionMarketShareToken',
        type: 'address',
      },
      {
        name: 'noToken',
        internalType: 'contract ExamplePredictionMarketShareToken',
        type: 'address',
      },
      { name: 'yesReserve', internalType: 'uint256', type: 'uint256' },
      { name: 'noReserve', internalType: 'uint256', type: 'uint256' },
      { name: 'liquidityWithdrawn', internalType: 'bool', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'eventId', internalType: 'uint256', type: 'uint256' },
      {
        name: 'outcome',
        internalType: 'enum ExamplePredictionMarket.Outcome',
        type: 'uint8',
      },
      { name: 'confidenceBps', internalType: 'uint16', type: 'uint16' },
      { name: 'evidenceURI', internalType: 'string', type: 'string' },
    ],
    name: 'forceSettle',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'eventId', internalType: 'uint256', type: 'uint256' }],
    name: 'getMarketEvent',
    outputs: [
      {
        name: '',
        internalType: 'struct ExamplePredictionMarket.Event',
        type: 'tuple',
        components: [
          { name: 'question', internalType: 'string', type: 'string' },
          { name: 'creator', internalType: 'address', type: 'address' },
          { name: 'eventOpen', internalType: 'uint256', type: 'uint256' },
          { name: 'eventClose', internalType: 'uint256', type: 'uint256' },
          {
            name: 'status',
            internalType: 'enum ExamplePredictionMarket.Status',
            type: 'uint8',
          },
          {
            name: 'outcome',
            internalType: 'enum ExamplePredictionMarket.Outcome',
            type: 'uint8',
          },
          { name: 'settledAt', internalType: 'uint256', type: 'uint256' },
          { name: 'evidenceURI', internalType: 'string', type: 'string' },
          { name: 'confidenceBps', internalType: 'uint16', type: 'uint16' },
          {
            name: 'yesToken',
            internalType: 'contract ExamplePredictionMarketShareToken',
            type: 'address',
          },
          {
            name: 'noToken',
            internalType: 'contract ExamplePredictionMarketShareToken',
            type: 'address',
          },
          { name: 'yesReserve', internalType: 'uint256', type: 'uint256' },
          { name: 'noReserve', internalType: 'uint256', type: 'uint256' },
          { name: 'liquidityWithdrawn', internalType: 'bool', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'eventId', internalType: 'uint256', type: 'uint256' }],
    name: 'getNoPrice',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'eventId', internalType: 'uint256', type: 'uint256' }],
    name: 'getYesPrice',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'question', internalType: 'string', type: 'string' },
      { name: 'duration', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'newEvent',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'nextEventId',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'paymentToken',
    outputs: [{ name: '', internalType: 'contract IERC20', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'eventId', internalType: 'uint256', type: 'uint256' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'redeemShares',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'eventId', internalType: 'uint256', type: 'uint256' }],
    name: 'requestSettlement',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newSettler', internalType: 'address', type: 'address' }],
    name: 'setSettler',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'eventId', internalType: 'uint256', type: 'uint256' },
      {
        name: 'outcome',
        internalType: 'enum ExamplePredictionMarket.Outcome',
        type: 'uint8',
      },
      { name: 'confidenceBps', internalType: 'uint16', type: 'uint16' },
      { name: 'evidenceURI', internalType: 'string', type: 'string' },
    ],
    name: 'settleEvent',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'eventId', internalType: 'uint256', type: 'uint256' },
      {
        name: 'outcome',
        internalType: 'enum ExamplePredictionMarket.Outcome',
        type: 'uint8',
      },
    ],
    name: 'settleEventManually',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'settler',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'eventId', internalType: 'uint256', type: 'uint256' }],
    name: 'withdrawLiquidity',
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// FHEConfidentialUSDC
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const fheConfidentialUsdcAbi = [
  {
    type: 'constructor',
    inputs: [{ name: 'owner', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'error',
    inputs: [{ name: 'requestId', internalType: 'uint256', type: 'uint256' }],
    name: 'ERC7984InvalidGatewayRequest',
  },
  {
    type: 'error',
    inputs: [{ name: 'receiver', internalType: 'address', type: 'address' }],
    name: 'ERC7984InvalidReceiver',
  },
  {
    type: 'error',
    inputs: [{ name: 'sender', internalType: 'address', type: 'address' }],
    name: 'ERC7984InvalidSender',
  },
  {
    type: 'error',
    inputs: [{ name: 'caller', internalType: 'address', type: 'address' }],
    name: 'ERC7984UnauthorizedCaller',
  },
  {
    type: 'error',
    inputs: [
      { name: 'holder', internalType: 'address', type: 'address' },
      { name: 'spender', internalType: 'address', type: 'address' },
    ],
    name: 'ERC7984UnauthorizedSpender',
  },
  {
    type: 'error',
    inputs: [
      { name: 'amount', internalType: 'euint64', type: 'bytes32' },
      { name: 'user', internalType: 'address', type: 'address' },
    ],
    name: 'ERC7984UnauthorizedUseOfEncryptedAmount',
  },
  {
    type: 'error',
    inputs: [{ name: 'holder', internalType: 'address', type: 'address' }],
    name: 'ERC7984ZeroBalance',
  },
  { type: 'error', inputs: [], name: 'InvalidKMSSignatures' },
  {
    type: 'error',
    inputs: [{ name: 'owner', internalType: 'address', type: 'address' }],
    name: 'OwnableInvalidOwner',
  },
  {
    type: 'error',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'OwnableUnauthorizedAccount',
  },
  {
    type: 'error',
    inputs: [
      { name: 'handle', internalType: 'bytes32', type: 'bytes32' },
      { name: 'sender', internalType: 'address', type: 'address' },
    ],
    name: 'SenderNotAllowedToUseHandle',
  },
  { type: 'error', inputs: [], name: 'ZamaProtocolUnsupported' },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'encryptedAmount',
        internalType: 'euint64',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'requester',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'AmountDiscloseRequested',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'encryptedAmount',
        internalType: 'euint64',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'AmountDisclosed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'from', internalType: 'address', type: 'address', indexed: true },
      { name: 'to', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'amount',
        internalType: 'euint64',
        type: 'bytes32',
        indexed: true,
      },
    ],
    name: 'ConfidentialTransfer',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'holder',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'operator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      { name: 'until', internalType: 'uint48', type: 'uint48', indexed: false },
    ],
    name: 'OperatorSet',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferred',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'handlesList',
        internalType: 'bytes32[]',
        type: 'bytes32[]',
        indexed: false,
      },
      {
        name: 'abiEncodedCleartexts',
        internalType: 'bytes',
        type: 'bytes',
        indexed: false,
      },
    ],
    name: 'PublicDecryptionVerified',
  },
  {
    type: 'function',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      {
        name: 'encryptedAmount',
        internalType: 'externalEuint64',
        type: 'bytes32',
      },
      { name: 'inputProof', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'burn',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'confidentialBalanceOf',
    outputs: [{ name: '', internalType: 'euint64', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'confidentialProtocolId',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'confidentialTotalSupply',
    outputs: [{ name: '', internalType: 'euint64', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      {
        name: 'encryptedAmount',
        internalType: 'externalEuint64',
        type: 'bytes32',
      },
      { name: 'inputProof', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'confidentialTransfer',
    outputs: [{ name: '', internalType: 'euint64', type: 'bytes32' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'euint64', type: 'bytes32' },
    ],
    name: 'confidentialTransfer',
    outputs: [{ name: '', internalType: 'euint64', type: 'bytes32' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'euint64', type: 'bytes32' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'confidentialTransferAndCall',
    outputs: [
      { name: 'transferred', internalType: 'euint64', type: 'bytes32' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      {
        name: 'encryptedAmount',
        internalType: 'externalEuint64',
        type: 'bytes32',
      },
      { name: 'inputProof', internalType: 'bytes', type: 'bytes' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'confidentialTransferAndCall',
    outputs: [
      { name: 'transferred', internalType: 'euint64', type: 'bytes32' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      {
        name: 'encryptedAmount',
        internalType: 'externalEuint64',
        type: 'bytes32',
      },
      { name: 'inputProof', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'confidentialTransferFrom',
    outputs: [
      { name: 'transferred', internalType: 'euint64', type: 'bytes32' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'euint64', type: 'bytes32' },
    ],
    name: 'confidentialTransferFrom',
    outputs: [
      { name: 'transferred', internalType: 'euint64', type: 'bytes32' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      {
        name: 'encryptedAmount',
        internalType: 'externalEuint64',
        type: 'bytes32',
      },
      { name: 'inputProof', internalType: 'bytes', type: 'bytes' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'confidentialTransferFromAndCall',
    outputs: [
      { name: 'transferred', internalType: 'euint64', type: 'bytes32' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'euint64', type: 'bytes32' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'confidentialTransferFromAndCall',
    outputs: [
      { name: 'transferred', internalType: 'euint64', type: 'bytes32' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'contractURI',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', internalType: 'uint8', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'encryptedAmount', internalType: 'euint64', type: 'bytes32' },
      { name: 'cleartextAmount', internalType: 'uint64', type: 'uint64' },
      { name: 'decryptionProof', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'discloseEncryptedAmount',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'holder', internalType: 'address', type: 'address' },
      { name: 'spender', internalType: 'address', type: 'address' },
    ],
    name: 'isOperator',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      {
        name: 'encryptedAmount',
        internalType: 'externalEuint64',
        type: 'bytes32',
      },
      { name: 'inputProof', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint64', type: 'uint64' },
    ],
    name: 'mintPlaintext',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'name',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'encryptedAmount', internalType: 'euint64', type: 'bytes32' },
    ],
    name: 'requestDiscloseEncryptedAmount',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'operator', internalType: 'address', type: 'address' },
      { name: 'until', internalType: 'uint48', type: 'uint48' },
    ],
    name: 'setOperator',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'interfaceId', internalType: 'bytes4', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// FHESecretMarketplace
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const fheSecretMarketplaceAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'settlerAddress', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  { type: 'error', inputs: [], name: 'AuctionAlreadySettled' },
  { type: 'error', inputs: [], name: 'AuctionDoesNotExist' },
  { type: 'error', inputs: [], name: 'AuctionNotActive' },
  { type: 'error', inputs: [], name: 'AuctionNotEnded' },
  { type: 'error', inputs: [], name: 'EndTimeInPast' },
  {
    type: 'error',
    inputs: [{ name: 'eventId', internalType: 'uint256', type: 'uint256' }],
    name: 'EventAlreadyResolved',
  },
  { type: 'error', inputs: [], name: 'InvalidKMSSignatures' },
  { type: 'error', inputs: [], name: 'NotPendingDecryption' },
  { type: 'error', inputs: [], name: 'NotSettler' },
  {
    type: 'error',
    inputs: [{ name: 'owner', internalType: 'address', type: 'address' }],
    name: 'OwnableInvalidOwner',
  },
  {
    type: 'error',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'OwnableUnauthorizedAccount',
  },
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
  {
    type: 'error',
    inputs: [
      { name: 'handle', internalType: 'bytes32', type: 'bytes32' },
      { name: 'sender', internalType: 'address', type: 'address' },
    ],
    name: 'SenderNotAllowedToUseHandle',
  },
  { type: 'error', inputs: [], name: 'ZamaProtocolUnsupported' },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'auctionId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'AuctionAdminExpired',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'auctionId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'sellerId',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
      {
        name: 'eventId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'AuctionCancelled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'auctionId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'sellerId',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
      {
        name: 'eventId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'AuctionClosePending',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'auctionId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'winningBid',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'sellerId',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
      {
        name: 'eventId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'AuctionClosed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'auctionId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'eventId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'sellerId',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
      {
        name: 'eventTitle',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
      {
        name: 'endTime',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'secretDataCid',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'AuctionCreated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'auctionId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'bidAmount',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'previousBid',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'BidPlaced',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'userId',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
    ],
    name: 'DepositedFor',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'externalEventId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'auctionsAffected',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'ExternalEventResolved',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferred',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'handlesList',
        internalType: 'bytes32[]',
        type: 'bytes32[]',
        indexed: false,
      },
      {
        name: 'abiEncodedCleartexts',
        internalType: 'bytes',
        type: 'bytes',
        indexed: false,
      },
    ],
    name: 'PublicDecryptionVerified',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'sellerId',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
    ],
    name: 'SellerRegistered',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'sellerId',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
      {
        name: 'auctionId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'predictionOutcome',
        internalType: 'enum FHESecretMarketplace.PredictionOutcome',
        type: 'uint8',
        indexed: false,
      },
      {
        name: 'scoreChange',
        internalType: 'int8',
        type: 'int8',
        indexed: false,
      },
      {
        name: 'newScore',
        internalType: 'int256',
        type: 'int256',
        indexed: false,
      },
    ],
    name: 'SellerReputationScoreUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousSettler',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newSettler',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'SettlerUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'userId',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
    ],
    name: 'WithdrawnFor',
  },
  {
    type: 'function',
    inputs: [{ name: 'auctionId', internalType: 'uint256', type: 'uint256' }],
    name: 'adminExpireAuction',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'auctionId', internalType: 'uint256', type: 'uint256' }],
    name: 'cancelAuction',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'auctionId', internalType: 'uint256', type: 'uint256' }],
    name: 'closeAuction',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'confidentialProtocolId',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'sellerId', internalType: 'string', type: 'string' },
      { name: 'eventId', internalType: 'uint256', type: 'uint256' },
      { name: 'eventTitle', internalType: 'string', type: 'string' },
      { name: 'endTime', internalType: 'uint256', type: 'uint256' },
      {
        name: 'encryptedPrediction',
        internalType: 'externalEbool',
        type: 'bytes32',
      },
      { name: 'secretDataCid', internalType: 'bytes32', type: 'bytes32' },
      {
        name: 'encryptedSecretKey',
        internalType: 'externalEuint256',
        type: 'bytes32',
      },
      { name: 'inputProof', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'createAuction',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'userId', internalType: 'string', type: 'string' },
      {
        name: 'encryptedAmount',
        internalType: 'externalEuint64',
        type: 'bytes32',
      },
      { name: 'inputProof', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'depositFor',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'eventAuctions',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    name: 'eventResolved',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'auctionId', internalType: 'uint256', type: 'uint256' },
      { name: 'winningBid', internalType: 'uint64', type: 'uint64' },
      { name: 'decryptionProof', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'finalizeAuctionClose',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'auctionId', internalType: 'uint256', type: 'uint256' },
      { name: 'predictionWasCorrect', internalType: 'bool', type: 'bool' },
      { name: 'decryptionProof', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'finalizeReputationResult',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'auctionId', internalType: 'uint256', type: 'uint256' }],
    name: 'getAuction',
    outputs: [
      { name: 'sellerId', internalType: 'string', type: 'string' },
      { name: 'endTime', internalType: 'uint256', type: 'uint256' },
      { name: 'currentBid', internalType: 'euint64', type: 'bytes32' },
      { name: 'currentBidderId', internalType: 'string', type: 'string' },
      { name: 'eventId', internalType: 'uint256', type: 'uint256' },
      { name: 'eventTitle', internalType: 'string', type: 'string' },
      {
        name: 'status',
        internalType: 'enum FHESecretMarketplace.AuctionStatus',
        type: 'uint8',
      },
      { name: 'reputationResolved', internalType: 'bool', type: 'bool' },
      { name: 'secretDataCid', internalType: 'bytes32', type: 'bytes32' },
      { name: 'currentBidPlaintext', internalType: 'uint64', type: 'uint64' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'userId', internalType: 'string', type: 'string' }],
    name: 'getBalance',
    outputs: [{ name: '', internalType: 'euint64', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'eventId', internalType: 'uint256', type: 'uint256' }],
    name: 'getEventAuctions',
    outputs: [{ name: '', internalType: 'uint256[]', type: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getOpenAuctions',
    outputs: [{ name: '', internalType: 'uint256[]', type: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'auctionId', internalType: 'uint256', type: 'uint256' }],
    name: 'getSecretDataKey',
    outputs: [{ name: '', internalType: 'euint256', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'sellerId', internalType: 'string', type: 'string' }],
    name: 'getSeller',
    outputs: [
      {
        name: '',
        internalType: 'struct FHESecretMarketplace.Seller',
        type: 'tuple',
        components: [
          { name: 'reputationScore', internalType: 'int256', type: 'int256' },
          { name: 'registered', internalType: 'bool', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'sellerId', internalType: 'string', type: 'string' }],
    name: 'getSellerAuctions',
    outputs: [{ name: '', internalType: 'uint256[]', type: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'auctionId', internalType: 'uint256', type: 'uint256' }],
    name: 'getSellerPrediction',
    outputs: [{ name: '', internalType: 'ebool', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getUnresolvedEvents',
    outputs: [{ name: '', internalType: 'uint256[]', type: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'nextAuctionId',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    name: 'openAuctionIds',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'paymentToken',
    outputs: [{ name: '', internalType: 'contract IERC7984', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    name: 'pendingAuctionClose',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    name: 'pendingIsCorrectHandle',
    outputs: [{ name: '', internalType: 'ebool', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    name: 'pendingReputationDecrypt',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'auctionId', internalType: 'uint256', type: 'uint256' },
      { name: 'bidderId', internalType: 'string', type: 'string' },
      { name: 'previousBidderId', internalType: 'string', type: 'string' },
      {
        name: 'encryptedAmount',
        internalType: 'externalEuint64',
        type: 'bytes32',
      },
      { name: 'inputProof', internalType: 'bytes', type: 'bytes' },
      { name: 'bidAmountPlaintext', internalType: 'uint64', type: 'uint64' },
    ],
    name: 'placeBid',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'userId', internalType: 'string', type: 'string' }],
    name: 'requestBalanceDecrypt',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'eventId', internalType: 'uint256', type: 'uint256' },
      { name: 'actualOutcomeIsYes', internalType: 'bool', type: 'bool' },
    ],
    name: 'resolveEventPredictions',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'string', type: 'string' },
      { name: '', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'sellerAuctions',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'newSettler', internalType: 'address', type: 'address' }],
    name: 'setSettler',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'settler',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    name: 'unresolvedEventIds',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'userId', internalType: 'string', type: 'string' },
      {
        name: 'encryptedAmount',
        internalType: 'externalEuint64',
        type: 'bytes32',
      },
      { name: 'inputProof', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'withdrawFor',
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// MockUSDC
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const mockUsdcAbi = [
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
  {
    type: 'error',
    inputs: [
      { name: 'spender', internalType: 'address', type: 'address' },
      { name: 'allowance', internalType: 'uint256', type: 'uint256' },
      { name: 'needed', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ERC20InsufficientAllowance',
  },
  {
    type: 'error',
    inputs: [
      { name: 'sender', internalType: 'address', type: 'address' },
      { name: 'balance', internalType: 'uint256', type: 'uint256' },
      { name: 'needed', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ERC20InsufficientBalance',
  },
  {
    type: 'error',
    inputs: [{ name: 'approver', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidApprover',
  },
  {
    type: 'error',
    inputs: [{ name: 'receiver', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidReceiver',
  },
  {
    type: 'error',
    inputs: [{ name: 'sender', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidSender',
  },
  {
    type: 'error',
    inputs: [{ name: 'spender', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidSpender',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'owner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'spender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Approval',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'from', internalType: 'address', type: 'address', indexed: true },
      { name: 'to', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Transfer',
  },
  {
    type: 'function',
    inputs: [
      { name: 'owner', internalType: 'address', type: 'address' },
      { name: 'spender', internalType: 'address', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'spender', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', internalType: 'uint8', type: 'uint8' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'name',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const
