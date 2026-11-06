# City of Toronto garden suite building permit application: the real flow

Mapped on 2026-11-05 by clicking through the live application up to its last screen. **Nothing was attached or submitted.** The browser was closed afterwards, which discarded the draft. Mike typed his own contact details on Step 5; they are not recorded here.

## How you get there

1. Garden suites overview (City Planning): https://www.toronto.ca/city-government/planning-development/planning-studies-initiatives/garden-suites/
2. Permit guide (Toronto Building), with required drawings, forms and fees: https://www.toronto.ca/services-payments/building-construction/apply-for-a-building-permit/building-permit-application-guides/renovation-and-new-house-guides/new-garden-suite/
3. "Apply for a Garden Suite permit" link at the bottom of the guide opens the generic **Express Building Permits** application:
   `https://www.toronto.ca/services-payments/building-construction/apply-for-a-building-permit/express-building-permits/express-building-permits-application/?appType=SR&subtopic=22001#submit`
   (redirects to a longer URL under `/building-permit/before-you-apply-for-a-building-permit/...`). `subtopic=22001` is what makes it a garden suite application; the screens never say "garden suite".

Useful sources for the agent:

| What | Where |
| --- | --- |
| Pre-approved plans | Certified Plans Program: https://www.toronto.ca/services-payments/building-construction/certifying-your-building-plans/ and the federal Housing Design Catalogue (linked from the garden suites page) |
| Zoning rules for garden suites | Summary of rules: https://www.toronto.ca/wp-content/uploads/2022/02/9320-cityplanning-garden-suites-summary-of-rules-Feb2022.pdf, By-law Chapter 150.7: https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter150_7.htm |
| Zoning map | https://map.toronto.ca/maps/map.jsp?app=ZBL_CONSULT |
| Tree Declaration Form | https://www.toronto.ca/wp-content/uploads/2022/05/95f0-Tree-Declaration-form-2022.pdf |
| Fire access rule | Max 45 m from the street to the suite entrance, path at least 1.0 m wide and 2.1 m clear: https://www.toronto.ca/services-payments/building-construction/apply-for-a-building-permit/building-permit-application-guides/renovation-and-new-house-guides/new-garden-suite/providing-fire-department-access-to-a-new-garden-suite/ |
| Fees | Certified plans permit: $15.75/m² (vs $18.56/m² standard), plus $56.33 per new unit (2026 rates, from the permit guide) |
| City's own AI pre-check tool | https://www.toronto.ca/services-payments/building-construction/building-permit/before-you-apply-for-a-building-permit/building-application-pre-check/ |

The application is a single-page wizard with **6 steps**: Address → Project Description → Pre-screening Questions → Application Screening Questions → Applicant Details → Add Application Documents. Each step has `Previous` and `Next` buttons (plain buttons, no ids; match by text). A notice "You must agree to the Terms of Use before continuing with using this application" shows on every step. A myToronto Terms and Conditions page ("I have read and agree" + `Proceed`, "will proceed to the login page") appeared on first load, but **no login was asked for through Step 6**. The login most likely comes on Submit. The page loads an invisible reCAPTCHA.

**There is no review screen.** Step 6 ends with `Submit`. 1City stops on Step 6 and never attaches or submits (hard rule 6).

## Step 1: Address

| Field | Selector | Notes |
| --- | --- | --- |
| What is the primary address of the property? | `#js_input__addressA_property_address` | Different id from the 311 forms. "Please press the enter key or click Find Address button." Shows "Selected Address" when found. |
| Unit Number (optional) | text box under the selected address | |

## Step 2: Project Description

| Field | Selector | Notes |
| --- | --- | --- |
| Project Description | `#projectDescription` | Required, up to 2000 characters. City's example: "Proposed new detached garage in rear yard of existing detached dwelling". For us: "Proposed new garden suite in rear yard of existing detached dwelling, using a City of Toronto certified (pre-approved) plan." |

## Step 3: Pre-screening Questions

| Question | Selectors | Notes |
| --- | --- | --- |
| Acknowledgment of existing violations/orders on property (checkbox) | `#OpenOrderViolations_0` | Required. Open orders send the application to the slower regular stream. Check with Building Application Status. |
| Is the project proposed on a designated heritage property? | `#HeritageDesignation_0` Yes / `#HeritageDesignation_1` No | Yes = not allowed in express stream; must email bldapplications@toronto.ca. Agent should check the Heritage Property Search and ask the resident. |
| Are you looking to receive a notice to use at Committee of Adjustment? | `#preScreenZoningIssues_0` Yes / `#preScreenZoningIssues_1` No | Yes = apply for a Zoning Applicable Law (ZAP) review by email first. |

## Step 4: Application Screening Questions

| Question | Selectors | Notes |
| --- | --- | --- |
| Who is the person taking responsibility for the design? | `#srDesignResponse_0` Home Owner/Qualified BCIN Designer, `_1` Professional Engineer/Architect, `_2` Both | For a certified plan, ask the resident who prepared/stamped the drawings. |
| Did you obtain a Zoning Applicable Law Certificate (ZAP)? | `#zapCertificate_0` Yes / `#zapCertificate_1` No | "If the project is not able to demonstrate compliance with the Zoning Bylaw, the application will be cancelled." |
| Party wall acknowledgment ("Confirm" checkbox) | `#partyWall_0` | Required. |

## Step 5: Applicant Details

| Field | Selector | Required |
| --- | --- | --- |
| Full Name | `#applicant_fullName` | yes |
| Name of Corporation or Partnership | `#applicant_corporation_partnership` | no |
| Primary Phone Number | `#applicant_phone` | yes |
| Primary Phone Extension | `#applicant_phone_extension` | no |
| Secondary Phone Number | `#applicant_mobile` | no |
| Mobile Extension | `#applicant_mobile_extension` | no |
| Email | `#applicant_email` | yes |

## Step 6: Add Application Documents (where 1City stops)

"Your application can only be submitted once all required documents have been successfully uploaded." A draft can be saved only by attaching at least the Building Permit Application form. All drawings must be combined into a single PDF set; renderings for Infill Public Notice as jpeg/gif.

Mandatory (each has its own `Attach` button):
1. Application Drawings (one combined PDF)
2. Building Permit Application (Application for a Permit to Construct or Demolish)
3. Energy Efficiency Design Summary
4. Schedule 1: Designer's Information
5. Tree Declaration Form (Urban Forestry)

Optional: Assumption of Responsibility for Engineering Content Form, Letter of Undertaking for Lot Grading, Other Supporting Documents.

Buttons: `Previous`, **`Submit`**. 1City never clicks either `Attach` or `Submit`. Its checklist lists these five documents as done or missing.

Screenshots: [terms/step 1](screens/permit-01-terms.png), [step 2](screens/permit-02-after-address.png), [step 3](screens/permit-03.png), [step 4](screens/permit-04.png), [step 6](screens/permit-06-documents.png)

## Friction found (also in `logs/friction.jsonl`)

1. The "Apply for a Garden Suite permit" link opens a generic "Express Building Permits" application that never mentions garden suites.
2. "You must agree to the Terms of Use" shows on every step, but there's no place on those steps to agree.
3. Jargon a resident won't know: ZAP certificate, Committee of Adjustment notice, BCIN designer, party wall permit.
4. Heritage properties can't use the online form at all; the answer is "email us".
5. No review screen before Submit.
6. Five mandatory PDFs, with all drawings merged into one file.
7. You can only save a draft by uploading the application form first.
8. The City runs its own AI pre-check tool on a separate page, not inside the application.
