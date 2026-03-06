//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ExamplePredictionMarket
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const examplePredictionMarketAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'forwarderAddress', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
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
    inputs: [
      { name: 'marketId', internalType: 'uint256', type: 'uint256' },
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
    inputs: [],
    name: 'getExpectedAuthor',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getExpectedWorkflowId',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getExpectedWorkflowName',
    outputs: [{ name: '', internalType: 'bytes10', type: 'bytes10' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getForwarderAddress',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'marketId', internalType: 'uint256', type: 'uint256' }],
    name: 'getMarket',
    outputs: [
      {
        name: '',
        internalType: 'struct ExamplePredictionMarket.Market',
        type: 'tuple',
        components: [
          { name: 'question', internalType: 'string', type: 'string' },
          { name: 'creator', internalType: 'address', type: 'address' },
          { name: 'marketOpen', internalType: 'uint256', type: 'uint256' },
          { name: 'marketClose', internalType: 'uint256', type: 'uint256' },
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
    inputs: [{ name: 'marketId', internalType: 'uint256', type: 'uint256' }],
    name: 'getNoPrice',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'marketId', internalType: 'uint256', type: 'uint256' }],
    name: 'getUri',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'marketId', internalType: 'uint256', type: 'uint256' }],
    name: 'getYesPrice',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    name: 'markets',
    outputs: [
      { name: 'question', internalType: 'string', type: 'string' },
      { name: 'creator', internalType: 'address', type: 'address' },
      { name: 'marketOpen', internalType: 'uint256', type: 'uint256' },
      { name: 'marketClose', internalType: 'uint256', type: 'uint256' },
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
    inputs: [{ name: 'question', internalType: 'string', type: 'string' }],
    name: 'newMarket',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'nextMarketId',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'metadata', internalType: 'bytes', type: 'bytes' },
      { name: 'report', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'onReport',
    outputs: [],
    stateMutability: 'nonpayable',
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
      { name: 'marketId', internalType: 'uint256', type: 'uint256' },
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
    inputs: [{ name: 'marketId', internalType: 'uint256', type: 'uint256' }],
    name: 'requestSettlement',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '_author', internalType: 'address', type: 'address' }],
    name: 'setExpectedAuthor',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '_id', internalType: 'bytes32', type: 'bytes32' }],
    name: 'setExpectedWorkflowId',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '_name', internalType: 'string', type: 'string' }],
    name: 'setExpectedWorkflowName',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '_forwarder', internalType: 'address', type: 'address' }],
    name: 'setForwarderAddress',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'marketId', internalType: 'uint256', type: 'uint256' },
      {
        name: 'outcome',
        internalType: 'enum ExamplePredictionMarket.Outcome',
        type: 'uint8',
      },
    ],
    name: 'settleMarketManually',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'interfaceId', internalType: 'bytes4', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'pure',
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
    inputs: [{ name: 'marketId', internalType: 'uint256', type: 'uint256' }],
    name: 'withdrawLiquidity',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousAuthor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newAuthor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'ExpectedAuthorUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousId',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'newId',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
    ],
    name: 'ExpectedWorkflowIdUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousName',
        internalType: 'bytes10',
        type: 'bytes10',
        indexed: true,
      },
      {
        name: 'newName',
        internalType: 'bytes10',
        type: 'bytes10',
        indexed: true,
      },
    ],
    name: 'ExpectedWorkflowNameUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousForwarder',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newForwarder',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'ForwarderAddressUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'marketId',
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
        name: 'marketId',
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
        name: 'marketOpen',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'marketClose',
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
    name: 'MarketCreated',
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
        name: 'message',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
    ],
    name: 'SecurityWarning',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'marketId',
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
        name: 'marketId',
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
        name: 'marketId',
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
        name: 'marketId',
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
  { type: 'error', inputs: [], name: 'AmountZero' },
  {
    type: 'error',
    inputs: [
      { name: 'received', internalType: 'address', type: 'address' },
      { name: 'expected', internalType: 'address', type: 'address' },
    ],
    name: 'InvalidAuthor',
  },
  { type: 'error', inputs: [], name: 'InvalidForwarderAddress' },
  { type: 'error', inputs: [], name: 'InvalidOutcome' },
  {
    type: 'error',
    inputs: [
      { name: 'sender', internalType: 'address', type: 'address' },
      { name: 'expected', internalType: 'address', type: 'address' },
    ],
    name: 'InvalidSender',
  },
  {
    type: 'error',
    inputs: [
      { name: 'received', internalType: 'bytes32', type: 'bytes32' },
      { name: 'expected', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'InvalidWorkflowId',
  },
  {
    type: 'error',
    inputs: [
      { name: 'received', internalType: 'bytes10', type: 'bytes10' },
      { name: 'expected', internalType: 'bytes10', type: 'bytes10' },
    ],
    name: 'InvalidWorkflowName',
  },
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
  {
    type: 'error',
    inputs: [
      { name: 'nowTs', internalType: 'uint256', type: 'uint256' },
      { name: 'closeTs', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'MarketNotClosed',
  },
  {
    type: 'error',
    inputs: [
      { name: 'nowTs', internalType: 'uint256', type: 'uint256' },
      { name: 'closeTs', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'MarketNotOpen',
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
  { type: 'error', inputs: [], name: 'WorkflowNameRequiresAuthorValidation' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// MockUSDC
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const mockUsdcAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'initialSupply', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
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
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// SecretMarketplace
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const secretMarketplaceAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'marketAddress', internalType: 'address', type: 'address' },
      { name: 'forwarderAddress', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'ACTION_CLOSE_AUCTION',
    outputs: [{ name: '', internalType: 'uint8', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'ACTION_FORCE_CLOSE_AUCTION',
    outputs: [{ name: '', internalType: 'uint8', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'ACTION_RESOLVE_MARKET',
    outputs: [{ name: '', internalType: 'uint8', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'CRE_ROLE',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'DEFAULT_ADMIN_ROLE',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
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
    inputs: [
      { name: 'seller', internalType: 'string', type: 'string' },
      { name: 'eventId', internalType: 'uint256', type: 'uint256' },
      { name: 'eventTitle', internalType: 'string', type: 'string' },
      { name: 'endTime', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'createAuction',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'auctionId', internalType: 'uint256', type: 'uint256' },
      { name: 'reputationDelta', internalType: 'int8', type: 'int8' },
    ],
    name: 'forceCloseAuction',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'auctionId', internalType: 'uint256', type: 'uint256' }],
    name: 'getAuction',
    outputs: [
      {
        name: '',
        internalType: 'struct SecretMarketplace.Auction',
        type: 'tuple',
        components: [
          { name: 'seller', internalType: 'string', type: 'string' },
          { name: 'endTime', internalType: 'uint256', type: 'uint256' },
          { name: 'currentBid', internalType: 'uint256', type: 'uint256' },
          { name: 'eventId', internalType: 'uint256', type: 'uint256' },
          { name: 'eventTitle', internalType: 'string', type: 'string' },
          {
            name: 'status',
            internalType: 'enum SecretMarketplace.AuctionStatus',
            type: 'uint8',
          },
          { name: 'reputationResolved', internalType: 'bool', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getExpectedAuthor',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getExpectedWorkflowId',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getExpectedWorkflowName',
    outputs: [{ name: '', internalType: 'bytes10', type: 'bytes10' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getForwarderAddress',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'externalMarketId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'getMarketAuctions',
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
    inputs: [{ name: 'role', internalType: 'bytes32', type: 'bytes32' }],
    name: 'getRoleAdmin',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'sellerName', internalType: 'string', type: 'string' }],
    name: 'getSeller',
    outputs: [
      {
        name: '',
        internalType: 'struct SecretMarketplace.Seller',
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
    inputs: [{ name: 'sellerName', internalType: 'string', type: 'string' }],
    name: 'getSellerAuctions',
    outputs: [{ name: '', internalType: 'uint256[]', type: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getUnresolvedMarkets',
    outputs: [{ name: '', internalType: 'uint256[]', type: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'grantRole',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'hasRole',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'marketAuctions',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    name: 'marketResolved',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
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
    inputs: [
      { name: 'metadata', internalType: 'bytes', type: 'bytes' },
      { name: 'report', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'onReport',
    outputs: [],
    stateMutability: 'nonpayable',
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
    outputs: [{ name: '', internalType: 'contract IERC20', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'auctionId', internalType: 'uint256', type: 'uint256' },
      { name: 'bidAmount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'placeBid',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'name', internalType: 'string', type: 'string' }],
    name: 'registerSeller',
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
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'callerConfirmation', internalType: 'address', type: 'address' },
    ],
    name: 'renounceRole',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'externalMarketId', internalType: 'uint256', type: 'uint256' },
      { name: 'delta', internalType: 'int8', type: 'int8' },
    ],
    name: 'resolveExternalMarket',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'revokeRole',
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
    inputs: [{ name: '_author', internalType: 'address', type: 'address' }],
    name: 'setExpectedAuthor',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '_id', internalType: 'bytes32', type: 'bytes32' }],
    name: 'setExpectedWorkflowId',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '_name', internalType: 'string', type: 'string' }],
    name: 'setExpectedWorkflowName',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '_forwarder', internalType: 'address', type: 'address' }],
    name: 'setForwarderAddress',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newMarket', internalType: 'address', type: 'address' }],
    name: 'setSimpleMarket',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'simpleMarket',
    outputs: [
      {
        name: '',
        internalType: 'contract IExamplePredictionMarket',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'interfaceId', internalType: 'bytes4', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'pure',
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
    name: 'unresolvedMarketIds',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'withdrawFunds',
    outputs: [],
    stateMutability: 'nonpayable',
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
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'seller',
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
        name: 'seller',
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
        name: 'heldAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'seller',
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
      {
        name: 'reputationDelta',
        internalType: 'int8',
        type: 'int8',
        indexed: false,
      },
    ],
    name: 'AuctionForceClosed',
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
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'previousBid',
        internalType: 'uint256',
        type: 'uint256',
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
        name: 'previousAuthor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newAuthor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'ExpectedAuthorUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousId',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'newId',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
    ],
    name: 'ExpectedWorkflowIdUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousName',
        internalType: 'bytes10',
        type: 'bytes10',
        indexed: true,
      },
      {
        name: 'newName',
        internalType: 'bytes10',
        type: 'bytes10',
        indexed: true,
      },
    ],
    name: 'ExpectedWorkflowNameUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'externalMarketId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      { name: 'delta', internalType: 'int8', type: 'int8', indexed: false },
      {
        name: 'auctionsAffected',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'ExternalMarketResolved',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousForwarder',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newForwarder',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'ForwarderAddressUpdated',
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
        name: 'seller',
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
      { name: 'delta', internalType: 'int8', type: 'int8', indexed: false },
      {
        name: 'newScore',
        internalType: 'int256',
        type: 'int256',
        indexed: false,
      },
    ],
    name: 'ReputationUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'previousAdminRole',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'newAdminRole',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
    ],
    name: 'RoleAdminChanged',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RoleGranted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RoleRevoked',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'message',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
    ],
    name: 'SecurityWarning',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'seller',
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
        name: 'previousMarket',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newMarket',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'SimpleMarketUpdated',
  },
  { type: 'error', inputs: [], name: 'AccessControlBadConfirmation' },
  {
    type: 'error',
    inputs: [
      { name: 'account', internalType: 'address', type: 'address' },
      { name: 'neededRole', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'AccessControlUnauthorizedAccount',
  },
  { type: 'error', inputs: [], name: 'AuctionAlreadySettled' },
  { type: 'error', inputs: [], name: 'AuctionDoesNotExist' },
  { type: 'error', inputs: [], name: 'AuctionNotActive' },
  { type: 'error', inputs: [], name: 'AuctionNotEnded' },
  { type: 'error', inputs: [], name: 'BidTooLow' },
  { type: 'error', inputs: [], name: 'EndTimeInPast' },
  {
    type: 'error',
    inputs: [
      { name: 'received', internalType: 'address', type: 'address' },
      { name: 'expected', internalType: 'address', type: 'address' },
    ],
    name: 'InvalidAuthor',
  },
  { type: 'error', inputs: [], name: 'InvalidForwarderAddress' },
  {
    type: 'error',
    inputs: [
      { name: 'sender', internalType: 'address', type: 'address' },
      { name: 'expected', internalType: 'address', type: 'address' },
    ],
    name: 'InvalidSender',
  },
  {
    type: 'error',
    inputs: [
      { name: 'received', internalType: 'bytes32', type: 'bytes32' },
      { name: 'expected', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'InvalidWorkflowId',
  },
  {
    type: 'error',
    inputs: [
      { name: 'received', internalType: 'bytes10', type: 'bytes10' },
      { name: 'expected', internalType: 'bytes10', type: 'bytes10' },
    ],
    name: 'InvalidWorkflowName',
  },
  {
    type: 'error',
    inputs: [{ name: 'eventId', internalType: 'uint256', type: 'uint256' }],
    name: 'MarketAlreadyResolved',
  },
  {
    type: 'error',
    inputs: [{ name: 'eventId', internalType: 'uint256', type: 'uint256' }],
    name: 'MarketDoesNotExist',
  },
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
    inputs: [{ name: 'action', internalType: 'uint8', type: 'uint8' }],
    name: 'UnknownAction',
  },
  { type: 'error', inputs: [], name: 'WorkflowNameRequiresAuthorValidation' },
] as const
