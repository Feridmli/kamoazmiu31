// ==================== syncNFTMetadata.js ====================
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

// ---------------- Supabase ----------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------- ENV ----------------
const NFT_CONTRACT_ADDRESS = process.env.NFT_CONTRACT_ADDRESS;
const RPC_LIST = [
  process.env.APECHAIN_RPC,
  "https://rpc.apechain.com/http",
  "https://apechain.drpc.org",
  "https://33139.rpc.thirdweb.com",
];
let providerIndex = 0;

function getProvider() {
  const rpc = RPC_LIST[providerIndex % RPC_LIST.length];
  providerIndex++;
  return new ethers.providers.JsonRpcProvider(rpc);
}

let provider = getProvider();

// ERC721A ABI
const nftABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function totalSupply() view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)"
];

let nftContract = new ethers.Contract(NFT_CONTRACT_ADDRESS, nftABI, provider);

// ---------------- Helper ----------------
function convertIPFStoHTTP(uri) {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) {
    return uri.replace("ipfs://", "https://ipfs.io/ipfs/");
  }
  return uri;
}

// ---------------- Process NFT ----------------
async function processNFT(tokenId) {
  try {
    let owner, tokenURI, success = false;

    for (let i = 0; i < RPC_LIST.length; i++) {
      try {
        owner = await nftContract.ownerOf(tokenId);
        tokenURI = await nftContract.tokenURI(tokenId);
        success = true;
        break;
      } catch (err) {
        if (err.message.includes("owner query for nonexistent token")) {
          console.log(`⚠️ Token #${tokenId} mint olunmayıb, keçildi.`);
          return;
        }
        console.warn(`RPC #${i + 1} failed for tokenId ${tokenId}: ${err.message}`);
        provider = getProvider();
        nftContract = new ethers.Contract(NFT_CONTRACT_ADDRESS, nftABI, provider);
      }
    }

    if (!success) throw new Error("All RPC endpoints failed");

    const httpURI = convertIPFStoHTTP(tokenURI);

    let name = null;
    try {
      const metadataRes = await fetch(httpURI);
      const metadata = await metadataRes.json();
      name = metadata.name || `Bear #${tokenId}`;
    } catch (e) {
      console.warn(`NFT #${tokenId} metadata fetch error:`, e.message);
      name = `Bear #${tokenId}`;
    }

    await supabase.from("metadata").upsert(
      {
        tokenId: tokenId.toString(),
        name,
        image: httpURI,
      },
      { onConflict: "tokenId" }
    );

    console.log(`✅ NFT #${tokenId} saved. Owner: ${owner}, Name: ${name}`);
  } catch (e) {
    console.warn(`❌ NFT #${tokenId} error:`, e.message);
  }
}

// ---------------- Main ----------------
async function main() {
  try {
    const totalSupply = await nftContract.totalSupply();
    console.log(`🚀 Total minted NFTs: ${totalSupply}`);

    const BATCH_SIZE = 20;
    for (let i = 0; i < totalSupply; i += BATCH_SIZE) {
      const batch = Array.from({ length: BATCH_SIZE }, (_, j) => i + j).filter(id => id < totalSupply);
      await Promise.allSettled(batch.map(tokenId => processNFT(tokenId)));
    }

    console.log("🎉 NFT owners + metadata sync tamamlandı!");
  } catch (err) {
    console.error("💀 Fatal error:", err.message);
    process.exit(1);
  }
}

main();
