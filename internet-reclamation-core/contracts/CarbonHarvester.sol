// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CarbonHarvester is EIP712, Ownable {
    using ECDSA for bytes32;

    mapping(string => bool) public soldAssets;
    address public treasury;

    event AssetSold(string indexed assetId, address indexed buyer, uint256 price);

    constructor(address _treasury) EIP712("InternetReclamationMarket", "1") Ownable(msg.sender) {
        treasury = _treasury;
    }

    struct DataAssetAccess {
        string id;
        uint256 accessFee;
        address publisher;
    }

    function buyAsset(DataAssetAccess calldata asset, bytes calldata signature) external payable {
        require(!soldAssets[asset.id], "Varlik zaten satildi");
        require(msg.value >= asset.accessFee, "Yetersiz odeme");

        bytes32 structHash = keccak256(abi.encode(
            keccak256("DataAssetAccess(string id,uint256 accessFee,address publisher)"),
            keccak256(bytes(asset.id)),
            asset.accessFee,
            asset.publisher
        ));

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);

        require(signer == owner(), "Gecersiz imza");
        soldAssets[asset.id] = true;

        (bool success, ) = payable(treasury).call{value: msg.value}("");
        require(success, "Transfer basarisiz");

        emit AssetSold(asset.id, msg.sender, msg.value);
    }
}
