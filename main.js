// ==================== main.js ====================
import { ethers } from "ethers";
import { Seaport } from "@opensea/seaport-js";

// ---------------- ENV ----------------
const NFT_CONTRACT_ADDRESS = import.meta.env.VITE_NFT_CONTRACT;
const SEAPORT_CONTRACT_ADDRESS = import.meta.env.VITE_SEAPORT_CONTRACT;

// ApeChain
const APECHAIN_ID = 33139;
const APECHAIN_ID_HEX = "0x8173";

// ---------------- Global State ----------------
let provider = null;
let signer = null;
let seaport = null;
let userAddress = null;

// ---------------- UI Elements ----------------
const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const addrSpan = document.getElementById("addr");
const marketplaceDiv = document.getElementById("marketplace");
const noticeDiv = document.getElementById("notice");

// ---------------- Utils ----------------
function notify(msg, timeout = 3500) {
  noticeDiv.textContent = msg;
  if (timeout) {
    setTimeout(() => {
      if (noticeDiv.textContent === msg) noticeDiv.textContent = "";
    }, timeout);
  }
}

// ---------------- Wallet Connect ----------------
async function connectWallet() {
  try {
    if (!window.ethereum) return alert("Metamask tapılmadı!");

    provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    userAddress = (await signer.getAddress()).toLowerCase();

    const network = await provider.getNetwork();
    if (network.chainId !== APECHAIN_ID) {
      try {
        await provider.send("wallet_addEthereumChain", [{
          chainId: APECHAIN_ID_HEX,
          chainName: "ApeChain Mainnet",
          nativeCurrency: { name: "APE", symbol: "APE", decimals: 18 },
          rpcUrls: ["https://rpc.apechain.com"],
          blockExplorerUrls: ["https://apescan.io"]
        }]);
        notify("Şəbəkə əlavə edildi, yenidən qoşun.");
        return;
      } catch (e) { console.error(e); }
    }

    seaport = new Seaport(signer, { contractAddress: SEAPORT_CONTRACT_ADDRESS });

    connectBtn.style.display = "none";
    disconnectBtn.style.display = "inline-block";
    addrSpan.textContent = userAddress.slice(0, 6) + "..." + userAddress.slice(-4);

    loadNFTs();
  } catch (err) {
    console.error(err);
    alert("Wallet connect xətası!");
  }
}

// ---------------- Disconnect ----------------
disconnectBtn.onclick = () => {
  provider = signer = seaport = userAddress = null;
  connectBtn.style.display = "inline-block";
  disconnectBtn.style.display = "none";
  addrSpan.textContent = "";
  marketplaceDiv.innerHTML = "";
  notify("Cüzdan ayırıldı", 2000);
};

connectBtn.onclick = connectWallet;

// ---------------- Load NFTs from Wallet ----------------
async function loadNFTs() {
  if (!signer) return;
  marketplaceDiv.innerHTML = "";
  notify("NFT-lər yüklənir...");

  try {
    const nftContract = new ethers.Contract(
      NFT_CONTRACT_ADDRESS,
      [
        "function balanceOf(address owner) view returns (uint256)",
        "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
        "function tokenURI(uint256 tokenId) view returns (string)"
      ],
      provider
    );

    const balance = await nftContract.balanceOf(userAddress);
    if (balance.toNumber() === 0) {
      marketplaceDiv.innerHTML = "<p>Bu səhifədə NFT yoxdur.</p>";
      return;
    }

    for (let i = 0; i < balance; i++) {
      const tokenId = await nftContract.tokenOfOwnerByIndex(userAddress, i);
      let tokenURI = await nftContract.tokenURI(tokenId);
      if (tokenURI.startsWith("ipfs://")) tokenURI = tokenURI.replace("ipfs://", "https://ipfs.io/ipfs/");

      let name = `Bear #${tokenId}`;
      let image = "https://ipfs.io/ipfs/QmExampleNFTImage/default.png";

      try {
        const res = await fetch(tokenURI);
        const meta = await res.json();
        name = meta.name || name;
        image = meta.image ? (meta.image.startsWith("ipfs://") ? meta.image.replace("ipfs://", "https://ipfs.io/ipfs/") : meta.image) : image;
      } catch (e) {
        console.warn(`NFT #${tokenId} metadata load error`, e.message);
      }

      const card = document.createElement("div");
      card.className = "nft-card";
      card.innerHTML = `
        <img src="${image}" alt="NFT image"
             onerror="this.src='https://ipfs.io/ipfs/QmExampleNFTImage/default.png'">
        <h4>${name}</h4>
        <p class="price">Qiymət: -</p>
        <div class="nft-actions">
          <button class="wallet-btn buy-btn" data-id="${tokenId}">Buy</button>
          <button class="wallet-btn list-btn" data-token="${tokenId}">List</button>
        </div>
      `;
      marketplaceDiv.appendChild(card);

      card.querySelector(".buy-btn").onclick = async (ev) => {
        ev.target.disabled = true;
        await buyNFT({ token_id: tokenId }).catch(console.error);
        ev.target.disabled = false;
      };

      card.querySelector(".list-btn").onclick = async (ev) => {
        ev.target.disabled = true;
        await listNFT(tokenId).catch(console.error);
        ev.target.disabled = false;
      };
    }
  } catch (err) {
    console.error(err);
    marketplaceDiv.innerHTML = "<p>Xəta baş verdi.</p>";
  }
}

// ---------------- BUY NFT ----------------
async function buyNFT(nftRecord) {
  if (!signer || !seaport) return alert("Cüzdan qoşulmayıb!");
  notify("Alış hazırlanır...");
  // Qeyd: NFT wallet sahibi öz NFT-lərini ala bilmir, backend order tələb olunur
  alert("Bu versiyada yalnız List əməliyyatı işləyir. Alış üçün backend lazım olacaq.");
}

// ---------------- LIST NFT ----------------
async function listNFT(tokenId) {
  if (!signer || !seaport) return alert("Cüzdan qoşulmayıb!");
  const seller = await signer.getAddress();

  const nftContract = new ethers.Contract(
    NFT_CONTRACT_ADDRESS,
    [
      "function ownerOf(uint256) view returns (address)",
      "function isApprovedForAll(address owner, address operator) view returns (bool)",
      "function setApprovalForAll(address operator, bool approved)"
    ],
    signer
  );

  notify("Sahiblik yoxlanılır...");
  const owner = (await nftContract.ownerOf(tokenId)).toLowerCase();
  if (owner !== seller.toLowerCase()) return alert("Bu NFT sənin deyil!");

  let price = prompt("NFT neçə APE? (məs: 1.5)");
  if (!price || isNaN(price)) return notify("Listing ləğv edildi.");

  const priceWei = ethers.utils.parseEther(price);
  const approved = await nftContract.isApprovedForAll(seller, SEAPORT_CONTRACT_ADDRESS);
  if (!approved) {
    notify("Approve göndərilir...");
    const tx = await nftContract.setApprovalForAll(SEAPORT_CONTRACT_ADDRESS, true);
    await tx.wait();
  }

  notify("Seaport order yaradılır...");
  const createReq = {
    offer:[{itemType:2, token:NFT_CONTRACT_ADDRESS, identifier:tokenId.toString()}],
    consideration:[{amount:priceWei.toString(), recipient:seller}],
    endTime:(Math.floor(Date.now()/1000)+86400*30).toString()
  };

  try {
    const orderResult = await seaport.createOrder(createReq, seller);
    const exec = orderResult.executeAllActions || orderResult.execute;
    await exec();

    notify(`NFT #${tokenId} list olundu — ${price} APE`);
  } catch(err) {
    console.error(err);
    notify("Order yaratmaq mümkün olmadı!");
  }

  loadNFTs();
}

window.loadNFTs = loadNFTs;
window.listNFT = listNFT;
window.buyNFT = buyNFT;
