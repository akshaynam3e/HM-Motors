# Legal and Privacy Review — Required Before Public Launch

This application is a technical starting point, not legal advice, a compliance certification, or a substitute for a qualified Indian lawyer. The business model and website features determine which obligations apply. The showroom owner and counsel must verify current statutory text, rules, commencement/effective dates, amendments, and transitional periods on official sources for the planned launch date. The site must not claim it is “DPDP compliant” merely because it has a privacy page or consent checkbox.

## Review separately by actual sales model

| Operating model | Questions for counsel and owner |
|---|---|
| Informational pages only | Is the legal business identity, contact information and location represented accurately? Are images, brand/trademark references and vehicle statements licensed/authorized? Are offers, claims and disclaimers accurate? What privacy/cookie/analytics notices are appropriate for the actual third parties used? |
| Lead-generation forms | Confirm the lawful basis/notice/consent wording for collecting name, phone, optional email, interest and message; privacy-contact/grievance details; purposes, sharing, retention, access/correction/erasure workflows; security/incident response; whether any customer is a child; and any applicable IT Act/rules and DPDP Act/Rules commencement/transitional requirements at launch. Review WhatsApp links and any future email/SMS campaigns separately. |
| Paid reservation or advance | Do not enable this in the delivered app. If later added, assess the actual merchant/seller, cancellation/refund disclosures, payment processor, receipt/tax/invoice, consumer complaint and grievance workflows, security, reconciliation, data sharing and e-commerce applicability before implementation. |
| Full online vehicle sale | Do not enable this in the delivered app. Obtain legal/tax advice on seller identity, product and price disclosures, delivery/registration/insurance/financing processes, cancellation/refund obligations, consumer-protection/e-commerce applicability, payment controls, warranty, grievance handling and data flows. |

The Consumer Protection (E-Commerce) Rules, 2020 and related consumer-protection requirements should not be assumed to apply identically to a static brochure, enquiry website, paid reservation flow and completed online vehicle sale. Counsel should determine applicability from the actual transaction, entity and website operations. GST, invoicing and dealership/vehicle-specific requirements also depend on the actual business model and transactions; do not display GST registration details or authorization claims without client verification.

## Official source discovery points

Start with the official Government of India sources and use the version effective on the launch date:

- India Code: https://www.indiacode.nic.in/ — search the Digital Personal Data Protection Act, 2023; Information Technology Act, 2000; Consumer Protection Act, 2019; and applicable rules.
- Ministry of Electronics and Information Technology (MeitY): https://www.meity.gov.in/ — verify official DPDP Rules, notifications, commencement and transitional provisions, plus applicable IT rules/advisories.
- Department of Consumer Affairs: https://consumeraffairs.nic.in/ — verify Consumer Protection (E-Commerce) Rules, 2020 and current consumer guidance/notifications.
- Central Board of Indirect Taxes and Customs (CBIC): https://www.cbic.gov.in/ — check GST-related official material for the confirmed sales model.

These are starting portals, not citations to an already completed legal opinion. Save exact document titles, official URLs, version dates and relevant sections in the client's approved legal review.

## Current app data and safety controls to review

Forms collect only name, Indian mobile number, optional email, optional vehicle selection/category (except a test-ride request), preferred contact, optional message and an explicit acknowledgement. The app records enquiry timestamps, consent time, source path and staff workflow. It intentionally does not request identity documents, lender credentials, payment details or sensitive financial records. Click analytics avoids names, phone numbers, full referrers and message text. Public forms have server-side validation, rate limits and a honeypot; administrative data is protected by role checks and sessions. These technical measures do not decide the legal basis or replace a documented privacy process.

Before accepting real enquiries, approve the privacy notice, purpose/notice/consent wording, privacy contact, retention schedule, data access/correction/deletion process, staff access list, backup deletion policy, vendor/hosting data processing terms, incident response contacts and any applicable breach notification workflow. The default retention field is an operational suggestion, not a legally established period. The `purge-closed` command only supports a configurable policy and must be dry-run, backed up and approved before use. A qualified person must verify an erasure request and any legal retention/hold before deletion.

## Advertising, media and product claims

Use only owner-approved, rights-cleared photos, brand assets, logos and marks. Record source/permission/expiry for each asset. Verify specifications against current manufacturer-authorized material or other reliable documents; verify exact model/variant/colour, ex-showroom price, location-specific on-road quote process, taxes, dates and offer terms. Do not create fake testimonials/reviews, false urgency, unverified dealer status, guaranteed mileage, guaranteed loan approval or misleading price/discount claims. The EMI calculator is a disclosed arithmetic estimate, not a finance offer or credit decision. A submitted test-ride time is not a confirmed appointment.

## Agreement between developer and client

The project agreement should state who controls the domain, hosting, database/backups, source code, business content and admin accounts; who verifies factual and legal copy; permitted data access for support; response/incident roles; backup frequency and retention; change requests; third-party/vendor costs; maintenance/support limits; acceptance criteria; and handover/removal of developer access. Obtain a separate written authorization for any personally identifiable information the developer may access during maintenance.
