// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Onchain registry + call analytics for SatSet's x402-priced API endpoints.
contract ApiRegistry {
    struct Endpoint {
        string path;
        uint256 priceMicro; // price in micro-USD (1e-6 USD), matches x402 USDC 6 decimals
        uint256 callCount;
    }

    address public owner;
    address public recorder;

    mapping(uint256 => Endpoint) private endpoints;
    uint256 public endpointCount;
    uint256 public globalCalls;

    event EndpointRegistered(uint256 indexed id, string path, uint256 priceMicro);
    event CallPaid(uint256 indexed id, address indexed payer, uint256 priceMicro);

    modifier onlyOwner() {
        require(msg.sender == owner, "ApiRegistry: not owner");
        _;
    }

    modifier onlyRecorder() {
        require(msg.sender == recorder, "ApiRegistry: not recorder");
        _;
    }

    constructor(address _recorder) {
        owner = msg.sender;
        recorder = _recorder;
    }

    function setRecorder(address _recorder) external onlyOwner {
        recorder = _recorder;
    }

    function registerEndpoint(string calldata path, uint256 priceMicro) external onlyOwner returns (uint256 id) {
        id = endpointCount;
        endpoints[id] = Endpoint(path, priceMicro, 0);
        endpointCount += 1;
        emit EndpointRegistered(id, path, priceMicro);
    }

    function recordCall(uint256 id, address payer) external onlyRecorder {
        require(id < endpointCount, "ApiRegistry: invalid id");
        Endpoint storage e = endpoints[id];
        e.callCount += 1;
        globalCalls += 1;
        emit CallPaid(id, payer, e.priceMicro);
    }

    function getEndpoint(uint256 id)
        external
        view
        returns (string memory path, uint256 priceMicro, uint256 callCount)
    {
        require(id < endpointCount, "ApiRegistry: invalid id");
        Endpoint storage e = endpoints[id];
        return (e.path, e.priceMicro, e.callCount);
    }
}
