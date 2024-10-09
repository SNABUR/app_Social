const { createPublicClient, http } = require('viem');
const { mainnet } = require('viem/chains');

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http("https://api.developer.coinbase.com/rpc/v1/base/yCYGyekgTfIGKsj-ZM_MQnJmbufDhUMh")
});

module.exports = publicClient;
