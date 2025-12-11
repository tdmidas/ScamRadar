// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract LocalNFT is ERC721Enumerable, Ownable {
    uint256 public nextId;

    constructor() ERC721("LocalNFT", "LNFT") Ownable(msg.sender) {}

    /// @notice Faucet mint: anyone can mint một NFT cho chính mình (chỉ dùng cho test local)
    function mintFaucet() external {
        _safeMint(msg.sender, nextId++);
    }

    /// @notice Owner mint tùy ý (giữ lại cho test)
    function mint(address to) external onlyOwner {
        _safeMint(to, nextId++);
    }

    // Required overrides for ERC721Enumerable
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}

