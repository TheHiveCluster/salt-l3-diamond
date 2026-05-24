// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { LibDiamond } from "../../libraries/LibDiamond.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC20 } from "../../interfaces/IERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MemeMarketplaceFacet
 * @notice Real on-chain Marketplace + Auction system for Meme NFTs.
 * 
 * Features:
 * - Fixed price listings (sell instantly)
 * - English Auctions (bidding)
 * - Protocol fee sent to FeeDistributor
 * - Uses SALT as payment currency
 * - Fully integrated with the Diamond
 */
contract MemeMarketplaceFacet is ReentrancyGuard {
    struct Listing {
        address seller;
        address nftContract;
        uint256 tokenId;
        uint256 price;          // in SALT (18 decimals)
        bool active;
    }

    struct Auction {
        address seller;
        address nftContract;
        uint256 tokenId;
        uint256 startingPrice;
        uint256 highestBid;
        address highestBidder;
        uint256 endTime;
        bool active;
    }

    struct Offer {
        address offerer;
        uint256 amount; // in SALT
        uint256 expiry;
        bool active;
    }

    // Storage
    bytes32 constant MARKETPLACE_STORAGE_POSITION = keccak256("salt.nft.meme.marketplace.storage");

    struct MarketplaceStorage {
        mapping(uint256 => Listing) listings;
        mapping(uint256 => Auction) auctions;
        mapping(uint256 => Offer) offers;               // offerId => Offer
        mapping(address => mapping(uint256 => address)) tokenCreator; // nft => tokenId => creator (for royalties)
        mapping(address => mapping(uint256 => uint256)) royaltyBps;   // nft => tokenId => royalty %

        uint256 nextListingId;
        uint256 nextAuctionId;
        uint256 nextOfferId;

        address feeDistributor;
        uint256 protocolFeeBps; // e.g. 250 = 2.5%
    }

    function marketplaceStorage() internal pure returns (MarketplaceStorage storage ms) {
        bytes32 position = MARKETPLACE_STORAGE_POSITION;
        assembly { ms.slot := position }
    }

    event Listed(uint256 indexed listingId, address indexed seller, address nftContract, uint256 tokenId, uint256 price);
    event Sale(uint256 indexed listingId, address indexed buyer, uint256 price);
    event ListingCancelled(uint256 indexed listingId);

    event AuctionCreated(uint256 indexed auctionId, address indexed seller, uint256 tokenId, uint256 startingPrice, uint256 endTime);
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount);
    event AuctionEnded(uint256 indexed auctionId, address winner, uint256 finalPrice);

    // ==================== Admin ====================

    function setFeeDistributor(address _distributor) external {
        LibDiamond.enforceIsContractOwner();
        marketplaceStorage().feeDistributor = _distributor;
    }

    function setProtocolFee(uint256 feeBps) external {
        LibDiamond.enforceIsContractOwner();
        require(feeBps <= 1000, "Marketplace: fee too high"); // max 10%
        marketplaceStorage().protocolFeeBps = feeBps;
    }

    function setRoyalty(address nftContract, uint256 tokenId, address creator, uint256 royaltyBps) external {
        // Only original creator or diamond owner can set
        LibDiamond.enforceIsContractOwner(); // simplified - in prod check msg.sender == minter
        MarketplaceStorage storage ms = marketplaceStorage();
        ms.tokenCreator[nftContract][tokenId] = creator;
        ms.royaltyBps[nftContract][tokenId] = royaltyBps;
    }

    // ==================== Fixed Price Listings ====================

    function listNFT(address nftContract, uint256 tokenId, uint256 priceInSALT) external {
        require(priceInSALT > 0, "Marketplace: price must be > 0");

        IERC721(nftContract).transferFrom(msg.sender, address(this), tokenId);

        MarketplaceStorage storage ms = marketplaceStorage();
        uint256 listingId = ms.nextListingId++;

        ms.listings[listingId] = Listing({
            seller: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            price: priceInSALT,
            active: true
        });

        emit Listed(listingId, msg.sender, nftContract, tokenId, priceInSALT);
    }

    function buyNFT(uint256 listingId) external {
        MarketplaceStorage storage ms = marketplaceStorage();
        Listing storage listing = ms.listings[listingId];
        require(listing.active, "Marketplace: listing not active");

        uint256 price = listing.price;
        uint256 fee = (price * ms.protocolFeeBps) / 10000;
        uint256 sellerAmount = price - fee;

        // Take payment in SALT
        IERC20(address(this)).transferFrom(msg.sender, address(this), price);

        // Royalty to creator
        uint256 royalty = 0;
        address creator = ms.tokenCreator[listing.nftContract][listing.tokenId];
        uint256 royaltyBps = ms.royaltyBps[listing.nftContract][listing.tokenId];
        if (creator != address(0) && royaltyBps > 0) {
            royalty = (price * royaltyBps) / 10000;
            if (royalty > 0) {
                IERC20(address(this)).transfer(creator, royalty);
            }
        }

        // === Small Burn Mechanism (0.1%) ===
        uint256 burnBps = 10;
        uint256 burnAmount = (price * burnBps) / 10000;
        if (burnAmount > 0) {
            IERC20(address(this)).burnForBridge(address(this), burnAmount); // burn from marketplace balance
        }

        // Protocol fee (after burn)
        uint256 remainingFee = fee > burnAmount ? fee - burnAmount : 0;
        if (remainingFee > 0 && ms.feeDistributor != address(0)) {
            IERC20(address(this)).transfer(ms.feeDistributor, remainingFee);
        }

        // Send to seller (minus royalty)
        uint256 finalSellerAmount = sellerAmount - royalty;
        if (finalSellerAmount > 0) {
            IERC20(address(this)).transfer(listing.seller, finalSellerAmount);
        }

        // Transfer NFT
        IERC721(listing.nftContract).transferFrom(address(this), msg.sender, listing.tokenId);

        listing.active = false;

        emit Sale(listingId, msg.sender, price);
    }

    function cancelListing(uint256 listingId) external {
        MarketplaceStorage storage ms = marketplaceStorage();
        Listing storage listing = ms.listings[listingId];
        require(listing.seller == msg.sender, "Marketplace: not seller");
        require(listing.active, "Marketplace: not active");

        listing.active = false;
        IERC721(listing.nftContract).transferFrom(address(this), msg.sender, listing.tokenId);

        emit ListingCancelled(listingId);
    }

    // ==================== Offer System ====================

    function makeOffer(address nftContract, uint256 tokenId, uint256 amount, uint256 duration) external {
        require(amount > 0, "Marketplace: offer must be > 0");

        MarketplaceStorage storage ms = marketplaceStorage();
        uint256 offerId = ms.nextOfferId++;

        ms.offers[offerId] = Offer({
            offerer: msg.sender,
            amount: amount,
            expiry: block.timestamp + duration,
            active: true
        });

        // Lock the offer amount in SALT
        IERC20(address(this)).transferFrom(msg.sender, address(this), amount);
    }

    function acceptOffer(uint256 offerId, address nftContract, uint256 tokenId) external {
        MarketplaceStorage storage ms = marketplaceStorage();
        Offer storage offer = ms.offers[offerId];
        require(offer.active && block.timestamp < offer.expiry, "Marketplace: offer expired or inactive");
        require(IERC721(nftContract).ownerOf(tokenId) == msg.sender, "Marketplace: not NFT owner");

        offer.active = false;

        uint256 fee = (offer.amount * ms.protocolFeeBps) / 10000;
        uint256 sellerAmount = offer.amount - fee;

        // === Small Burn Mechanism (0.1%) on offer acceptance ===
        uint256 burnBps = 10;
        uint256 burnAmount = (offer.amount * burnBps) / 10000;
        if (burnAmount > 0) {
            IERC20(address(this)).burnForBridge(address(this), burnAmount);
        }

        uint256 remainingFee = fee > burnAmount ? fee - burnAmount : 0;
        if (remainingFee > 0 && ms.feeDistributor != address(0)) {
            IERC20(address(this)).transfer(ms.feeDistributor, remainingFee);
        }

        IERC20(address(this)).transfer(msg.sender, sellerAmount);
        IERC721(nftContract).transferFrom(msg.sender, offer.offerer, tokenId);
    }

    function cancelOffer(uint256 offerId) external {
        MarketplaceStorage storage ms = marketplaceStorage();
        Offer storage offer = ms.offers[offerId];
        require(offer.offerer == msg.sender, "Marketplace: not offerer");
        require(offer.active, "Marketplace: offer not active");

        offer.active = false;
        IERC20(address(this)).transfer(msg.sender, offer.amount);
    }

    // ==================== Auctions ====================

    function createAuction(address nftContract, uint256 tokenId, uint256 startingPrice, uint256 duration) external {
        require(startingPrice > 0, "Marketplace: starting price must be > 0");
        require(duration >= 1 hours && duration <= 30 days, "Marketplace: invalid duration");

        IERC721(nftContract).transferFrom(msg.sender, address(this), tokenId);

        MarketplaceStorage storage ms = marketplaceStorage();
        uint256 auctionId = ms.nextAuctionId++;

        ms.auctions[auctionId] = Auction({
            seller: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            startingPrice: startingPrice,
            highestBid: 0,
            highestBidder: address(0),
            endTime: block.timestamp + duration,
            active: true
        });

        emit AuctionCreated(auctionId, msg.sender, tokenId, startingPrice, block.timestamp + duration);
    }

    function placeBid(uint256 auctionId, uint256 bidAmount) external {
        MarketplaceStorage storage ms = marketplaceStorage();
        Auction storage auction = ms.auctions[auctionId];
        require(auction.active, "Marketplace: auction not active");
        require(block.timestamp < auction.endTime, "Marketplace: auction ended");
        require(bidAmount > auction.highestBid, "Marketplace: bid too low");
        require(bidAmount >= auction.startingPrice, "Marketplace: below starting price");

        // Take SALT from bidder
        IERC20(address(this)).transferFrom(msg.sender, address(this), bidAmount);

        // Refund previous bidder in SALT
        if (auction.highestBidder != address(0)) {
            IERC20(address(this)).transfer(auction.highestBidder, auction.highestBid);
        }

        auction.highestBid = bidAmount;
        auction.highestBidder = msg.sender;

        emit BidPlaced(auctionId, msg.sender, bidAmount);
    }

    function endAuction(uint256 auctionId) external {
        MarketplaceStorage storage ms = marketplaceStorage();
        Auction storage auction = ms.auctions[auctionId];
        require(auction.active, "Marketplace: auction not active");
        require(block.timestamp >= auction.endTime, "Marketplace: auction not ended yet");

        auction.active = false;

        uint256 fee = (auction.highestBid * ms.protocolFeeBps) / 10000;
        uint256 sellerAmount = auction.highestBid - fee;

        // Send fee to FeeDistributor
        if (fee > 0 && ms.feeDistributor != address(0)) {
            IERC20(address(this)).transfer(ms.feeDistributor, fee);
        }

        // Send to seller
        if (sellerAmount > 0) {
            IERC20(address(this)).transfer(auction.seller, sellerAmount);
        }

        // Transfer NFT to winner
        if (auction.highestBidder != address(0)) {
            IERC721(auction.nftContract).transferFrom(address(this), auction.highestBidder, auction.tokenId);
        } else {
            // No bids - return to seller
            IERC721(auction.nftContract).transferFrom(address(this), auction.seller, auction.tokenId);
        }

        emit AuctionEnded(auctionId, auction.highestBidder, auction.highestBid);
    }

    // ==================== Views ====================

    function getListing(uint256 listingId) external view returns (Listing memory) {
        return marketplaceStorage().listings[listingId];
    }

    function getAuction(uint256 auctionId) external view returns (Auction memory) {
        return marketplaceStorage().auctions[auctionId];
    }
}
