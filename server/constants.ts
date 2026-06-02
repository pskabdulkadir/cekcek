/**
 * @file constants.ts
 * @description Blockchain-related constants and compiled bytecode
 */

// GreenToken (KECO) Compiled Bytecode
// Derive from: contracts/GreenToken.sol -> solc --optimize
export const GREENTIN_TOKEN_BYTECODE = "0x60806040526002805460ff191660121790553480156200001e57600080fd5b5060405162000b1938038062000b19833981016040819052620000419162000145565b60006200004f848262000249565b5060016200005e838262000249565b5060038190553360009081526004602052604090205550620003159050565b634e487b7160e01b600052604160045260246000fd5b600082601f830112620000a557600080fd5b81516001600160401b0380821115620000c262000c26200007d565b604051601f8301601f19908116603f01168101908282118183101715620000ed57620000ed6200007d565b81604052838152602092508660208588010111156200010b57600080fd5b600091505b838210156200012f578582018301518183018401529082019062000110565b6000602085830101528094505050505092915050565b6000806000606084860312156200015b57600080fd5b83516001600160401b03808211156200017373600080fd5b620001818783880162000093565b945060208601519150808211156200019857600080fd5b50620001a78682870162000093565b925050604084015190509250925092565b600181811c90821680620001cd57607f821691505b602082108103620001ee57634e487b7160e01b600052602260045260246000fd5b50919050565b601f82111562000244576000816000526020600020601f850160051c810160208610156200021f5750805b601f850160051c820191505b8181101562000240578281556001016200022b565b5050505b505050565b81516001600160401b038111156200026565620002656200007d565b6200027d81620002768454620001b8565b84620001f4565b602080601f831160018114620002b555600084156200029c5750858301515b600019600386901b1c1916600185901b17855562000240565b600085815260208120601f198616915b82811015620002e6578886015182559484019460019091019...";

// GreenToken ABI for ContractFactory
export const GREENTOKEN_ABI = [
  "constructor(string n, string s, uint256 supply)",
  "function balanceOf(address a) view returns (uint256)",
  "function mint(address to, uint256 amount) public",
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function transfer(address to, uint256 amount) public returns (bool)",
  "function decimals() view returns (uint8)"
];

// Standard ERC20 ABI for token interactions
export const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint256 amount) public returns (bool)",
  "function decimals() view returns (uint8)",
  "function mint(address to, uint256 amount) public"
];

// QuickSwap Router ABI (Polygon)
export const QUICKSWAP_ROUTER_ABI = [
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)",
  "function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory amounts)"
];
