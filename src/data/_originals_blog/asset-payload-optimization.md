ORIGINAL DRAFT — preserved for reference, not rendered to the published page.

The original version of this post was heavily proprietary — it included full JSON payload dumps with internal IDs (assetID 1219, 1294, "RCBMO240601", "LNXSC240203"), real partner names ("InCred Financial", "Vivriti Capital Limited"), product-type-specific fields (bonds, sdi, sdiSecondary, fundingDetails for Startup Equity), specific component names from the codebase (PastOfferingTableView, AnnouncementWidget, KYCBanner, KycEntryBanner, MenuDrawer, VideoComponent, ProductRemovalCard, LockedOverlay, InvestmentNumberCard, AssetInfo, InvestorConsentKYC, etc.), specific API endpoints (/v1/stats/returns, getSpvDetailsId, getSpvDetailsList, getKYCDetailsList), and a specific KYC Entry Banner experiment launched on 18 July 2024.

ORIGINAL TITLE: Shrinking Asset List and Details API Responses at Grip Invest
ORIGINAL DESCRIPTION: How we put the asset list and asset details endpoints on a payload diet across the Grip Invest platform — auditing unused fields, reshaping nested keys, and refactoring the frontend pages that consumed them.

ORIGINAL OPENING: At Grip Invest, two endpoints carry most of the weight on the catalogue side of the product: asset list (/assets, /past-deals) and asset details (/assetdetails/[...]). Both had grown organically over years — Bonds, SDIs, Baskets, FDs, Startup Equity, CRE, SE deals all stacked on top of the same response shape.

ORIGINAL UNUSED-AT-PLATFORM FIELDS LIST (originally listed verbatim): difaIDs, specialHighlight, dealType, endDate, createdAt, visibleTo, leadInvestorLogo, reducingInterestRate

ORIGINAL UNUSED-IN-LIST FIELDS: bgimageWebsite, desc, gripFee, hasLlp, repaymentCycle, repeatInvestorsPercentage, isVisible, visibility, preTaxMaxAmount, maxAmount, spvID, status

ORIGINAL DETAILS-UNUSED FIELDS (~30 keys originally listed): overallCollectedTillNowWithThesePartners, firstPaymentDate, userWaitListAmount, highYieldFDsDetails, leadInvestorLogo, createdAt, updatedAt, lastNudgeInterestEmail, delayedReason, repayment, specialHighlight, difaIDs, autoinvestment, dealAlert, visibleTo, isPublicAsset, lastMilestoneDate, lastMilestone, forecastedReturn, riskAgreement, assetAgreement, operatingPartner, leadPartner, dealCloseDate, endDate, startDate, riskRating, overAmount, investmentInto, visibility

ORIGINAL TRIMMED-LIST TYPE (originally shown verbatim as TypeScript):
type AssetListResponseModelWithPast = {
  bonds: { raisedAmount, ytm, rating, bondRatedBy, preTaxYtm, bondRating };
  sdi: { irr };
  sdiSecondary: { rating };
  fundingDetails: { leadInvestorName };  // Startup Equity
  // Common across product types
  logo, partnerName, collectedAmount, totalReturnsAmount, totalAmount,
  preTaxTotalAmount, returnsToBePaid, postTaxYield, irr
};

ORIGINAL RESHAPES:
- assetMappingData.calculationInputFields was nested an extra level deep
- spvCategoryPg (string used as boolean) → spvCategoryDetails.isAssetPG (real boolean)
- spvParent (nested object) → spvCategoryDetails.parentID (flat ID)

ORIGINAL IMPACT SURFACES:
- Asset list endpoint: Current Asset List, Portfolio Summary for Asset List
- Asset details endpoint: Asset Details Page, Asset Agreement Page, Payment Processing Page

ORIGINAL FRONTEND REFACTOR — page name was pages/assets/index.tsx
ORIGINAL LEGACY COMPONENTS REMOVED: MobileSortBy from TitleSection, ScreenSizeHook→useMediaQuery, CSS-in-JS primitives Flex/Text/Dummy
ORIGINAL CONTEXT PROPS REMOVED: handleOverlayBtnClick, isMobile
ORIGINAL APIS MOVED: /v1/stats/returns and Transparency data → InvestmentNumberCard; getSpvDetailsId, getSpvDetailsList, getKYCDetailsList → LockedOverlay
ORIGINAL DYNAMIC-IMPORT TARGETS: PastOfferingTableView, AnnouncementWidget, LockedOverlay (and children), ProductRemovalCard, MenuDrawer, VideoComponent, getMobileTitleSection, KYCBanner, KycEntryBanner

ORIGINAL EXPERIMENT NOTE: KYC Entry Banner Experiment was launched on 18 July 2024.

═══════════════════════════════════════════════════════
SANITIZATION DIFF SUMMARY:
- Title and description: dropped Grip Invest, asset/list/details specifics
- All JSON payload dumps with internal IDs/names removed
- Partner names ("InCred Financial", "Vivriti Capital") removed
- Product types (Bonds, SDIs, Baskets, FDs, Startup Equity, CRE, SE) → generic "item types"
- Specific field names (assetID, RCBMO240601, fundingDetails, sdiSecondary, etc.) → described pattern, not value
- Specific API paths (/assets, /past-deals, /assetdetails/[...], /v1/stats/returns) → described purpose, not URL
- Specific component names (PastOfferingTableView, KYCBanner, etc.) → described purpose
- Specific page filename (pages/assets/index.tsx) → "the listing page"
- Specific experiment date (18 July 2024) → "mid-cycle"
- Reshape examples kept since they illustrate the universal pattern
- Code-block reshape examples kept (spvCategoryPg → isAssetPG, spvParent → parentID) since these illustrate a useful general pattern
═══════════════════════════════════════════════════════
