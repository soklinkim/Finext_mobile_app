/**
 * FINEXT's policies, shown under Settings > Policies. Drafts written from what the app actually does (checked against
 * the code: what is stored, how sharing with lenders works, what the AI uses) and from the frameworks that apply in
 * Cambodia as of October 2026. They are not legal advice and must be reviewed by a lawyer before launch; items in
 * [brackets] are decisions still to be made. English only for now: a legal text needs a checked Khmer translation.
 */
export type PolicyId = 'policy' | 'privacy' | 'ai' | 'terms' | 'lenders' | 'governance';

export interface PolicySection {
  heading: string;
  body?: string[];
  bullets?: string[];
}

export interface Policy {
  id: PolicyId;
  title: string;
  summary: string;
  sections: PolicySection[];
}

export const POLICY_ORDER: PolicyId[] = ['policy', 'privacy', 'ai', 'terms', 'lenders', 'governance'];

export const POLICIES: Record<PolicyId, Policy> = {
  policy: {
    id: 'policy',
    title: 'FINEXT Data and AI Policy',
    summary: 'The formal policy: how FINEXT governs the data it holds and the AI it uses.',
    sections: [
      {
        heading: 'Document control',
        bullets: [
          'Policy owner: the FINEXT team (Team F4), which holds the data protection and AI model responsibilities in section 8 jointly during the prototype stage.',
          'Approved by: FINEXT team (Team F4). [Confirm with management before launch.]',
          'Version: 1.1, 5 November 2026 (competition prototype). Effective date: [to be set on approval for launch].',
          'Review: at least once a year, and whenever a law or framework named in section 5 changes.',
        ],
      },
      {
        heading: '1. Purpose',
        body: [
          "This policy sets out how FINEXT collects, uses, protects and shares data, and how it designs, tests, uses and oversees artificial intelligence (AI). Its aim is that small business owners can trust FINEXT with their records, and that FINEXT's AI helps them understand their business without harming them.",
        ],
      },
      {
        heading: '2. Scope',
        body: [
          'This policy applies to the FINEXT mobile app, its servers and the lender portal; to all data FINEXT holds about its users and their businesses; to every AI feature in FINEXT; and to everyone who builds, runs or has access to FINEXT, including partner lenders when they view shared data.',
        ],
      },
      {
        heading: '3. Definitions',
        bullets: [
          'User: a business owner with a FINEXT account.',
          'Personal data: information about an identifiable person, such as name, email or phone number.',
          'Business data: bookkeeping entries, statements, documents and profile details of a business.',
          'Lender: a bank or financial institution that a user chooses to share data with.',
          'AI feature: any FINEXT function that estimates or forecasts from data, whether a trained model or a statistical method.',
          'Model: the trained risk model that estimates the chance of serious financial difficulty within 12 months.',
        ],
      },
      {
        heading: '4. Policy statement',
        body: ['FINEXT commits to the following principles:'],
        bullets: [
          'Lawfulness: we follow the laws of Cambodia and prepare early for laws still in draft.',
          'User control: users own their data. Nothing is shared with a lender without the user\'s explicit, specific and time-limited consent.',
          'Minimisation: we collect only what the features need and use it only for the purposes stated in this policy.',
          'Security: data is protected against loss, unauthorised access, change and disclosure.',
          'Human decision-making: AI informs users; it never makes a credit decision about anyone.',
          'Transparency: every AI estimate is explained, and its limits are stated.',
          'Fairness: AI uses business figures only, never personal traits.',
          'Accountability: named people are responsible for data and for AI, and their decisions are recorded.',
        ],
      },
      {
        heading: '5. Legal and framework basis',
        bullets: [
          'Constitution of the Kingdom of Cambodia: the right to privacy.',
          'Law on Electronic Commerce (2019): the duty to protect stored electronic data.',
          'Law on Consumer Protection (2019): clear information and fair treatment of consumers.',
          'Draft Law on Personal Data Protection: followed in advance (legal grounds for using data, rights of the people concerned, answering requests within one month); this policy will be updated when it is adopted.',
          'NIST AI Risk Management Framework (AI RMF 1.0): the Govern, Map, Measure and Manage functions.',
          'OECD AI Principles: benefit to people, human rights and fairness, transparency, robustness and safety, accountability.',
          'ASEAN Guide on AI Governance and Ethics (2024) and the direction of Cambodia\'s draft National AI Strategy 2025-2030.',
          'ISO/IEC 27001 (information security) and DAMA-DMBOK (data governance and data quality): FINEXT\'s data controls are designed in line with them.',
          'ISO/IEC 42001 (AI management systems): FINEXT\'s AI governance is designed in line with it.',
          'ASEAN Data Management Framework (2021) and ASEAN Model Contractual Clauses (2021): data classification and safeguards for data stored outside Cambodia.',
          'Monetary Authority of Singapore FEAT Principles (fairness, ethics, accountability, transparency in financial AI) and the G20/OECD High-Level Principles on Financial Consumer Protection (2022).',
          'Benchmarks, not binding in Cambodia: the EU General Data Protection Regulation and the EU AI Act, which treats AI credit scoring of people as high-risk. FINEXT aims to meet their bar.',
          'FINEXT is aligned with these standards; it has not been externally audited or certified against them.',
        ],
      },
      {
        heading: '6. Data governance',
        body: [
          '6.1 Collection. FINEXT collects account details, business and owner profiles, bookkeeping entries, the names of cash, bank and wallet accounts, uploaded business documents and app settings. It does not collect location, contacts, bank log-in details or credit bureau records. Owner check-in answers stay on the user\'s device. The business details given at sign-up are also kept with the user\'s sign-in account, so they can be restored on a new device. The user\'s answers about days with no entries are kept with their profile. Bank statement PDFs that users import are read and deleted at once; only the entries the user confirms are kept.',
          '6.2 Use. Data is used to keep the user\'s books, produce statements, health ratios and AI estimates, sync between the user\'s devices, and prepare loan packs at the user\'s request. Data is never sold or used for advertising.',
          '6.3 Consent and sharing. A lender can see a user\'s data only after the user gives consent in the app, choosing the lender, the information (loan readiness score, statements, health ratios, trends, documents) and the period (30, 90 or 180 days). Users can withdraw consent at any time, with immediate effect. Every lender view is recorded. AI risk estimates are not shared with lenders.',
          '6.4 Storage and security. Data is kept on the user\'s device and in FINEXT\'s cloud database. Access requires sign-in, and each account can reach only its own data. [Before launch: confirm encrypted connections (HTTPS) everywhere and state the server location.]',
          '6.5 Retention and deletion. Data is kept while the account is open. On a deletion request, data is removed [within 30 days], except records the law requires FINEXT to keep, which are kept only as long as required. [An in-app deletion option is to be added.]',
          '6.6 Rights of users. Users can see, correct, copy (statements as PDF) and ask to delete their data, and withdraw consent to sharing. Requests are answered within one month.',
          '6.7 Data quality. Entries are checked against accounting rules when recorded, and unusual entries (likely duplicates, an extra zero, a cost recorded as income, future dates) are flagged for the user to review before they affect estimates. Past days with no entries are flagged so the user can complete them.',
          '6.8 Estimated and converted figures. FINEXT never fills in missing data on its own. For a day with no entries, the user chooses to enter the real figures, record the day as zero, or fill it with the average of their recorded days; an average is marked ~, says how it was worked out, and can be removed or replaced by real figures at any time. When a statement in riel is imported into an app set to US dollars, each amount is converted at a fixed rate of 4,000 riel = 1 US dollar after the user has checked it, marked *, and the original riel amount is kept in the entry\'s note.',
          '6.9 Storage outside Cambodia. FINEXT\'s cloud database may be located outside Cambodia [location to be stated]. Such storage is protected by contract terms based on the ASEAN Model Contractual Clauses, and by the same access and security controls as any other FINEXT data.',
        ],
      },
      {
        heading: '7. AI governance',
        body: [
          '7.1 Permitted uses. AI in FINEXT is used to estimate 12-month financial risk, forecast 3-month cash stress, check debt capacity, show the effect of changes (what-if), and flag unusual entries. Any new AI use needs the approval of the FINEXT team and an update to this policy.',
          '7.2 Human oversight. AI outputs are guidance for the user. FINEXT does not approve or refuse loans, and lenders make their own decisions. Users can question any estimate, and a person reviews it.',
          '7.3 Transparency and explainability. Each estimate shows its level (low, moderate, high), its main reasons, and a note on its limits. The app states where AI is used, what data it uses and how it was tested.',
          '7.4 Fairness. AI features use only the business\'s financial figures. They never use gender, age, ethnicity, religion, location or other personal traits.',
          '7.5 Validation. Before release, each model version is tested on companies it has never seen, across countries, against simple rules (the Altman Z-score and "loss-making"), and on small-business profiles run through the real app. Results and known limits are recorded in a model card. Finance-direction constraints ensure that, all else equal, higher profit, more cash or lower debt cannot raise the estimate.',
          '7.6 Local calibration. Estimates are set to Cambodia\'s published bad-loan rate (8.3%, National Bank of Cambodia, 2025). Lenders can test the model on their own records with FINEXT\'s validation kit; only summary figures leave the lender.',
          '7.7 Monitoring and change. Models are re-checked when new data becomes available and at least once a year. A feature that gives wrong or unfair results is paused or clearly labelled until fixed. Each change of model version is recorded.',
          '7.8 Loan offers. A lender\'s offer (amount, interest rate, term) is the lender\'s own decision. FINEXT shows the full terms and an estimated monthly repayment before the user answers; the user can accept or decline freely; and an answer counts only for the offer the user was shown. If the lender changes its offer, the user must look at the new one before answering. FINEXT does not lend money and does not make or influence the decision.',
        ],
      },
      {
        heading: '8. Roles and responsibilities',
        bullets: [
          'Management: approves this policy and gives the resources to carry it out.',
          'Data protection (held by the FINEXT team): answers user requests, keeps records of consent and sharing, handles data incidents.',
          'AI model responsibility (held by the FINEXT team): approves AI features and model versions, keeps model cards, oversees monitoring.',
          'Developers and staff: follow this policy and report any concern straight away.',
          'Lenders: view shared data only for assessing the user\'s application, within the consent given, and follow "Rules for partner banks".',
        ],
      },
      {
        heading: '9. Incidents',
        body: [
          'Any suspected data breach or harmful AI behaviour is reported to the FINEXT team at once, investigated without delay, and recorded. Affected users, partner lenders whose shared data is involved, and the relevant authorities are told within 72 hours of FINEXT becoming aware of a breach that puts their data at risk, with what happened, what data was affected and what they should do. The cause is fixed before the feature is used again.',
        ],
      },
      {
        heading: '10. Compliance and exceptions',
        body: [
          'Compliance is checked at each annual review and before each release. Any exception needs written approval from the policy owners, with the reason and an end date. Breaches of this policy are handled under FINEXT\'s disciplinary and contractual terms.',
        ],
      },
      {
        heading: '11. Related documents',
        bullets: ['Privacy and data', 'How FINEXT uses AI', 'Terms of use', 'Rules for partner banks', 'Data and AI governance', 'Model card of the current risk model'],
      },
      {
        heading: '12. Contact',
        body: ['Questions about this policy: the FINEXT team (Team F4); during the prototype stage there is no separate support address.'],
      },
    ],
  },

  privacy: {
    id: 'privacy',
    title: 'Privacy and data',
    summary: 'What we collect, why, where it is kept, and the control you have over it.',
    sections: [
      {
        heading: 'In short',
        bullets: [
          'Your books belong to you. We use them to run FINEXT for you, and for nothing else.',
          'We never sell your data and show no advertising.',
          'A bank sees your information only if you choose to share it, only what you pick, and only for as long as you allow.',
        ],
      },
      {
        heading: 'What we collect',
        bullets: [
          'Account: your email address and sign-in details (passwords are handled by our sign-in provider; we never see them).',
          'Business and owner profile: the details you enter, such as business name, type and contact details. What you give when you sign up is also kept with your sign-in account, so it comes back on a new phone.',
          'Your answers about days with no entries (for example "nothing happened that day"), so another phone does not ask again.',
          'Bookkeeping: the entries you record (sales, costs, stock, loans, savings) and the cash, bank and wallet accounts you name.',
          'Documents you upload: your patent tax certificate and certificate of incorporation.',
          'Bank statements you import: the PDF is read on our server and deleted straight away. Only the entries you choose to keep are saved, like entries you type in; the full account number is never kept.',
          'Settings: language, currency and exchange rate.',
        ],
      },
      {
        heading: 'What we do not collect',
        bullets: [
          'Your location, contacts, photos or messages.',
          'Bank or wallet log-in details: FINEXT does not connect to your bank accounts.',
          'Credit bureau records or any data about you from outside the app.',
          'Your owner check-in answers: they stay on your phone and are never sent to us.',
        ],
      },
      {
        heading: 'Why we use it',
        bullets: [
          'To keep your books, including when you are offline, and to sync them between your devices.',
          'To produce your statements, financial health ratios and the AI estimates described in "How FINEXT uses AI".',
          'To prepare a loan pack and share it with a bank, only when you ask us to.',
        ],
      },
      {
        heading: 'Estimated and converted numbers',
        bullets: [
          'FINEXT never fills in missing days on its own. For a day with no entries, you choose: enter the real figures, record it as zero, or use your average.',
          'An average is marked ~ and says how it was worked out. You can remove it or replace it with the real figures at any time.',
          'A statement in riel imported into an app set to dollars is converted at a fixed 4,000 riel = 1 US dollar, after you have checked it. Converted entries are marked *, and the original riel amount is kept in the note.',
        ],
      },
      {
        heading: 'Where it is kept',
        body: [
          'On your device, so the app works without internet, and in our cloud database so your books are safe and available on your other devices. Each account can reach only its own data, and you must sign in to see it. [Server location and provider terms to be confirmed and stated here.]',
        ],
      },
      {
        heading: 'Sharing with banks',
        bullets: [
          'Nothing is shared until you give consent in the loan pack.',
          'You choose the bank, what it sees (loan readiness score, statements, health ratios, trends, documents) and for how long (30, 90 or 180 days).',
          'You can stop sharing at any time; access ends straight away.',
          'Each time a bank opens your information, we record it.',
          'The AI risk estimate is shown only to you. It is not sent to banks.',
        ],
      },
      {
        heading: 'Your rights',
        bullets: [
          'See your data: everything you entered is in the app.',
          'Correct it: edit or cancel any entry.',
          'Take a copy: download your statements as PDF.',
          'Withdraw consent: stop sharing with any bank at any time.',
          'Delete your account and data: ask the FINEXT team. We aim to answer requests within one month.',
        ],
      },
      {
        heading: 'How long we keep it',
        body: [
          'While your account is open. After you ask us to delete it, we remove your data [within 30 days], except anything the law requires us to keep, which we keep only for as long as required.',
        ],
      },
      {
        heading: 'Security and problems',
        body: [
          'Your data is protected by sign-in. [Before launch: confirm every connection is encrypted (HTTPS) and state it here.] If a security incident puts your data at risk, we will tell you within 72 hours of finding out: what happened, what was affected and what you should do. We also tell any bank you share with, and the relevant authorities.',
        ],
      },
      {
        heading: 'Laws we follow',
        body: [
          "FINEXT follows Cambodian law, including the right to privacy in the Constitution, the Law on Electronic Commerce (2019), which requires anyone storing electronic data to protect it from loss, unauthorised access, change or disclosure, and the Law on Consumer Protection (2019). Cambodia's Law on Personal Data Protection is still a draft; this policy is designed to meet its main requirements, and we will update it when the law is adopted.",
        ],
      },
      {
        heading: 'Contact and changes',
        body: [
          'Questions or requests: the FINEXT team (Team F4); during the prototype stage there is no separate support address. We will tell you in the app before any important change to this policy.',
        ],
      },
    ],
  },

  ai: {
    id: 'ai',
    title: 'How FINEXT uses AI',
    summary: 'Where AI is used, what it looks at, how it was tested, and its limits.',
    sections: [
      {
        heading: 'In short',
        bullets: [
          'The AI gives estimates to help you plan. It does not make decisions about you.',
          'It looks only at the books you keep in FINEXT.',
          'Every estimate comes with the reasons behind it.',
          'FINEXT never approves or refuses a loan. Banks make their own decisions, and the AI estimate is not sent to them.',
        ],
      },
      {
        heading: 'Where it is used',
        bullets: [
          '12-month risk estimate (a trained model): how likely the business is to run into serious difficulty in the next year, shown as low, moderate or high, with the main reasons.',
          '3-month cash forecast (a statistical simulation): 2,000 possible paths for your cash, built from your own month-to-month records.',
          'Debt check and what-if sliders (calculations): how much repayment the business can carry, and how changes to prices, costs or collections would move the estimates.',
          'Unusual-entry alerts (statistical checks): entries that look like mistakes, such as duplicates or an extra zero. Nothing is changed without you.',
        ],
      },
      {
        heading: 'What it looks at',
        body: [
          "Only the business's own figures from your bookkeeping: sales, costs, stock, cash, what is owed to and by the business, and how these change. It never uses your gender, age, ethnicity, religion, location, or any information about you as a person, and never uses other users' data to judge you.",
        ],
      },
      {
        heading: 'How it was built and tested',
        bullets: [
          'The risk model learned from real, public company accounts (Polish companies, 2000 to 2013, published by the UCI Machine Learning Repository) and whether each company failed within a year.',
          'On 1,170 companies it had never seen, it ranked a failing company above a healthy one 93% of the time and flagged 92% of the companies that later failed. About 1 in 4 of its warnings were real problems, so treat a warning as a reason to look closer.',
          "Its percentages are set to Cambodia's 2025 bad-loan rate of 8.3% (National Bank of Cambodia, Annual Supervision Report 2025).",
          'It has not yet been tested on Cambodian businesses: no public data links Cambodian business books to loan outcomes. Banks can test it on their own records with our validation kit, without sharing them.',
        ],
      },
      {
        heading: 'Limits',
        bullets: [
          'Estimates, not certainties: read the level (low, moderate, high) more than the exact percentage.',
          'A risk estimate needs at least 6 complete months of records; more months make it steadier.',
          'It is only as good as your records. Missing or wrong entries change the answer.',
          'Averages you choose for missed days are simple arithmetic, not AI. They are marked ~ so you and any bank can tell them from real figures.',
          'It is not financial, tax or legal advice.',
        ],
      },
      {
        heading: 'Your choices',
        bullets: [
          'Correct any entry and the estimates update.',
          'Mark an unusual-entry alert as right if it is.',
          'Switch between plain and accounting language in Profile.',
          'Question an estimate: tell the FINEXT team. A person will review it.',
        ],
      },
      {
        heading: 'Principles we follow',
        body: [
          'Our AI governance is aligned with the NIST AI Risk Management Framework (AI RMF 1.0) and the OECD AI Principles: AI that benefits people, respects privacy and fairness, is transparent and explainable, is robust, secure and safe, and has clear accountability. "Data and AI governance" sets out how we apply them.',
          "In the region, we also follow the ASEAN Guide on AI Governance and Ethics (2024) and the direction of Cambodia's draft National AI Strategy 2025-2030 on ethical and responsible AI.",
        ],
      },
    ],
  },

  terms: {
    id: 'terms',
    title: 'Terms of use',
    summary: 'The rules for using FINEXT.',
    sections: [
      {
        heading: 'What FINEXT is',
        body: [
          'A bookkeeping app for small businesses, with statements, financial health checks and AI estimates built from your own records. It is not a bank, does not lend money and does not decide on loans.',
        ],
      },
      {
        heading: 'Your responsibilities',
        bullets: [
          'Keep your entries accurate and complete. Statements and estimates come from what you record.',
          'Keep your sign-in details private and tell us if you think someone else has used your account.',
          'Use FINEXT only for your own lawful business.',
        ],
      },
      {
        heading: 'Statements and estimates',
        body: [
          'Statements are produced automatically from your entries and are not audited. Estimates are guidance, not advice. Check important decisions with a qualified adviser and with your bank.',
        ],
      },
      {
        heading: 'Banks in the app',
        body: [
          'In this version, the partner banks listed are examples for demonstration. No information is sent to a real bank. [Replace this paragraph when real partnerships are signed.]',
          'When a bank approves your application, it makes an offer: the amount, interest rate and term. The offer is the bank\'s decision, not FINEXT\'s. FINEXT shows the full terms and an estimated monthly repayment (worked out on a declining balance; your bank\'s figure may differ, for example with a flat rate). You are free to accept or decline. Your answer counts only for the offer you were shown: if the bank changes it, you will see the new offer first. Check the final terms with the bank before you sign anything.',
        ],
      },
      {
        heading: 'Availability',
        body: [
          'We work to keep FINEXT available and your data safe, but cannot promise the service will never be interrupted. Your entries stay on your device and sync when the connection returns.',
        ],
      },
      {
        heading: 'Liability, ending and law',
        body: [
          '[Limits of liability, how either side can end the service, and how disputes are settled under Cambodian law: to be written with a lawyer.]',
        ],
      },
    ],
  },

  lenders: {
    id: 'lenders',
    title: 'Rules for partner banks',
    summary: 'What a bank may and may not do with the information a business shares with it.',
    sections: [
      {
        heading: 'In short',
        bullets: [
          'A bank sees a business\'s information only because the owner chose to share it, and only what the owner chose, for as long as the owner allows.',
          'The bank uses it only to assess that business\'s loan application.',
          'Every time the bank opens the information, it is recorded and the owner can see it.',
        ],
      },
      {
        heading: 'What a bank may do',
        bullets: [
          'View the information the owner shared (loan readiness score, statements, health ratios, trends or documents) while the consent is active.',
          'Record its decision and, when approving, make an offer with the amount, interest rate and term, which the owner can accept or decline.',
          'Download a loan pack to keep with the application file, under the bank\'s own record-keeping rules.',
        ],
      },
      {
        heading: 'What a bank may not do',
        bullets: [
          'Use the information for anything other than assessing that application, such as marketing or other products.',
          'Pass it to anyone outside the staff assessing the application.',
          'Keep viewing it after the owner withdraws consent or the consent period ends; access stops automatically.',
          'Ask the owner for their FINEXT password or log in as them.',
        ],
      },
      {
        heading: 'Access and security',
        bullets: [
          'Only bank staff named by the bank get access to the FINEXT bank portal, each with their own sign-in.',
          'The bank tells FINEXT straight away when a staff member leaves or no longer needs access, and if it suspects misuse or a security problem.',
          'Copies downloaded from the portal are protected like the bank\'s other customer records and deleted under its retention rules.',
        ],
      },
      {
        heading: 'Decisions',
        body: [
          'Every lending decision is made by the bank\'s own staff under its own credit policy. FINEXT\'s figures support that assessment; they do not replace it. FINEXT\'s AI risk estimate is never shared with banks.',
        ],
      },
      {
        heading: 'Frameworks',
        body: [
          'These rules follow the user-control and purpose-limitation principles of Cambodia\'s draft Law on Personal Data Protection, the ASEAN Data Management Framework, and the third-party data expectations in the National Bank of Cambodia\'s technology risk guidelines for banks.',
        ],
      },
    ],
  },

  governance: {
    id: 'governance',
    title: 'Data and AI governance',
    summary: 'How FINEXT is run responsibly: who is accountable, and the checks we keep.',
    sections: [
      {
        heading: 'Who is accountable',
        bullets: [
          'Data protection: the FINEXT team answers privacy requests and handles incidents.',
          'AI model: the FINEXT team approves each model version before release and watches how it performs.',
        ],
      },
      {
        heading: 'Data',
        bullets: [
          'Collect only what the features need, and use it only for the purposes in the privacy policy.',
          'Sharing with a bank always needs consent, has a chosen scope and an end date, can be stopped at any time, and every view is recorded.',
          'Each account can reach only its own data.',
          'Requests to see, correct or delete data are answered within one month.',
        ],
      },
      {
        heading: 'AI models',
        bullets: [
          'Every model version has a model card: the data it learned from, how it was tested, and its known limits.',
          'Before release, a model is tested on companies it never saw, in another country (Poland to the United States and back), against simple rules (the Altman Z-score and "loss-making"), and on 18 small-business profiles run through the real app.',
          'Finance-direction constraints: with everything else the same, higher profit, more cash or lower debt cannot raise the estimate.',
          'Every estimate shows its reasons, and the app says what the AI is and is not.',
          'Banks can test the model on their own loan records with our validation kit; only summary figures leave the bank.',
          'The model is checked again whenever new data is available, and at least once a year.',
        ],
      },
      {
        heading: 'Frameworks we align with',
        body: [
          'Our approach is organised around the four functions of the NIST AI Risk Management Framework (AI RMF 1.0) and the OECD AI Principles:',
        ],
        bullets: [
          'Govern: named owners for data and for the AI model, these written policies, and a yearly review.',
          'Map: each AI feature has a stated purpose, the data it uses and who it affects. It informs owners and does not decide on loans.',
          'Measure: models are tested on companies they never saw, in another country, against simple rules and on real small-business profiles, and each version has a model card.',
          'Manage: unusual-entry checks catch bad data before it is scored, a feature is paused or labelled if it misbehaves, and banks can test the model on their own records without sharing them.',
          'OECD AI Principles: benefit to people (helping small businesses reach credit); privacy and fairness (only business figures, never personal traits); transparency and explainability (reasons shown with every estimate); robustness, security and safety (validation and data checks); accountability (named owners and records of who saw shared data).',
        ],
      },
      {
        heading: 'Problems and reviews',
        bullets: [
          'Security incidents are investigated straight away; affected users, partner banks and authorities are told within 72 hours of FINEXT finding out.',
          'If the AI is found to give wrong or unfair results, the affected feature is paused or labelled until it is fixed.',
          "These policies are reviewed every year, and when Cambodia's Law on Personal Data Protection is adopted.",
        ],
      },
    ],
  },
};
