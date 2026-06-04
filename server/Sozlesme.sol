// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title Sozlesme
 * @dev İnternet Geri Kazanım Çekirdeği için otonom token ve veri kayıt kontratı.
 */
contract Sozlesme is ERC20 {
    event DataAssetRegistered(uint256 amount, string proof);
    event BulkRegistered(uint256 count);

    constructor(string memory _name, string memory _symbol, uint256 _initialSupply) 
        ERC20(_name, _symbol) 
    {
        _mint(msg.sender, _initialSupply);
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    /**
     * @dev KRİTİK GÜNCELLEME: Veri kaydedildiği an token üretimi tetiklenir.
     */
    function registerDataAsset(uint256 amount, string memory proof) public returns (bool) {
        _mint(msg.sender, amount); // Veriyi işleyen cüzdana ödül basılır
        emit DataAssetRegistered(amount, proof);
        return true;
    }

    /**
     * @dev blockchain.ts tarafındaki bulkRegisterDataAssets fonksiyonu için eklendi.
     */
    function bulkRegister(uint256[] memory amounts, string[] memory proofs) public returns (bool) {
        require(amounts.length == proofs.length, "Dizi uzunluklari esit olmali");
        for (uint256 i = 0; i < amounts.length; i++) {
            emit DataAssetRegistered(amounts[i], proofs[i]);
        }
        emit BulkRegistered(amounts.length);
        return true;
    }

    // Blockchain.ts içindeki diğer ABI gereksinimleri için stub fonksiyonlar
    function submitProof(bytes32 /* proofHash */, uint256 /* amount */) external pure returns (bool) { return true; }
}