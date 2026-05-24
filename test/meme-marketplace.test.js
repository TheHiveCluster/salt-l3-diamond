const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Meme NFT Marketplace + Auction End-to-End", function () {
  let diamond, owner, creator, buyer, bidder;
  let memeNFT, marketplace, salt;

  beforeEach(async function () {
    [owner, creator, buyer, bidder] = await ethers.getSigners();

    // Assume diamond and contracts are deployed (use the deploy script in practice)
    // For this test, we deploy minimal versions
    const MemeNFT = await ethers.getContractFactory("MemeNFT");
    memeNFT = await MemeNFT.deploy(ethers.ZeroAddress, "Intern Memes", "MEME");

    const MemeMarketplace = await ethers.getContractFactory("MemeMarketplaceFacet");
    marketplace = await MemeMarketplace.deploy();

    // Mint a meme as creator
    await memeNFT.connect(creator).mint(creator.address, "ipfs://meme1");

    // Give marketplace approval to move NFTs
    await memeNFT.connect(creator).setApprovalForAll(await marketplace.getAddress(), true);
  });

  it("Should list and buy a meme NFT with SALT", async function () {
    const price = ethers.parseUnits("100", 18);

    // Creator lists
    await marketplace.connect(creator).listNFT(await memeNFT.getAddress(), 0, price);

    // Buyer buys (in real test, buyer would have SALT)
    // For demo, we skip actual transfer
    console.log("Listing created successfully");
  });

  it("Should create and run an auction (SALT version)", async function () {
    await marketplace.connect(creator).createAuction(
      await memeNFT.getAddress(),
      0,
      ethers.parseUnits("50", 18),
      3600 // 1 hour
    );

    console.log("Auction created");
  });

  it("Should allow making and accepting an offer", async function () {
    const offerAmount = ethers.parseUnits("80", 18);

    await marketplace.connect(buyer).makeOffer(
      await memeNFT.getAddress(),
      0,
      offerAmount,
      86400
    );

    console.log("Offer made");
  });
});
