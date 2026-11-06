# City of Toronto online pothole request: the real flow

Mapped on 2026-11-05 by clicking through the live form up to the final review screen. **Nothing was submitted.** The draft used test text and was discarded by closing the browser.

## How you get there

1. `https://www.toronto.ca/311` → "Create a Service Request" → "Potholes"
2. Potholes page: `https://www.toronto.ca/services-payments/streets-parking-transportation/road-maintenance/potholes/`
3. There are **three separate forms** depending on where the pothole is:

| Where | Form URL |
| --- | --- |
| Road (the one we use) | `https://www.toronto.ca/home/311-toronto-at-your-service/create-a-service-request/service-request/?request=0VS6g000000DzbXGAS` |
| Expressway | `...service-request/?request=0VS6g000000DzbWGAS` |
| Bike lane | `...service-request/?request=0VS6g000000QcmhGAC` |

The form is a single page wizard. The URL never changes between steps. A progress bar shows 5 steps: **Terms of Use → Location → Request Details → Contact → Review and Submit**. Every step has `Previous`, `Cancel` and `Next` buttons (`#js-button__prev`, `#js-button__cancel`, `#js-button__next`).

The page loads an **invisible Google reCAPTCHA**. It did not challenge us while mapping, but it may on Submit. If it shows a puzzle, the bot must stop and hand the browser to Mike (hard rule 3).

## Step 1: Pick the concern (shown as "Terms of Use")

Heading: "Potholes, Road Maintenance and Repair"

| Field | Type | Selector | Value to use |
| --- | --- | --- | --- |
| What is the concern you are reporting? | dropdown | `#a0K6g000009yWuXEAU` | `Road Pothole` |

Other options: Bollard Maintenance, Fence Maintenance, Guardrail Maintenance, Laneway Repair, Maintenance Hole Damage, Retaining Wall Maintenance, Road Cleaning, Road Damage - Other, Shoulder Maintenance, Standing Water, Traffic Island. Other options reveal extra dropdowns (repair type, lid issue, sinking/utility cut, sidewalk).

Button: `Continue`.

## Step 1b: "Confirm the Following" (the actual Terms of Use step)

Heading: "Road Pothole / Road Damage". Missed on the first walkthrough because Mike clicked through it by hand; found while testing.

| Question | Selector for our answer | Answer |
| --- | --- | --- |
| Is this pothole or road damage located on Toronto Island? | `#a0K6g000009yWjhEAE_1` | No |
| Is the pothole or road damage on a City of Toronto road or expressway? | `#a0K6g000009yWjiEAE_0` | Road |
| Is the pothole or road damage in a bike lane on a City of Toronto road? | `#a0K6g00000GSUHbEAP_1` | No |

Button: `Start your Request`.

## Step 1c: Terms of Use

Heading: "Road Pothole / Road Damage - Step 1: Terms of Use". A notice of collection plus six sections of terms. **The session times out after 10 minutes of inactivity.**

| Field | Selector | Value |
| --- | --- | --- |
| I understand and agree to the Terms of Use (checkbox) | `#declarationconsent_0` | checked |

Button: `Next`. 1City shows the resident a line in the summary saying that typing "yes" also agrees to these terms (https://www.toronto.ca/home/311-toronto-at-your-service/311-terms-of-use/). Then the heading changes to "Step 2: Location".

## Step 2: Location

| Field | Type | Selector | Required | Notes |
| --- | --- | --- | --- | --- |
| Address, Intersection, Park Name or Landmark | search box with suggestions | `#address` | yes | Type, wait for the list, then **click a suggestion** (`#typeahead-listbox--item__N`). |
| Use my location | button | | | Not used |
| Find Address | button | | | Not used. The bot clicks a suggestion instead. |
| My Address Cannot Be Found | checkbox | `#address-unverified_0` | no | |
| Unit | text, becomes a dropdown of units after an address is picked | `#address-unit` | no | |
| Additional location information | text area, 255 chars | `#address-additional-information` | no | e.g. "south-west corner by the hydro pole" |
| Refine the Location | map pin you can drag | | no | Skip |

After a pick, a "Selected Address" box shows what the City actually stored. **The bot must read this back and check it matches the resident's location before pressing Next.**

## Step 3: Request Details

| Field | Type | Selector | Required |
| --- | --- | --- | --- |
| What is the exact location of the pothole/road damage? (distance from intersection, landmarks, side of road) | text area, 255 chars | `#a0K6g00000H9GaKEAV` | yes |
| Describe the size and depth of the road damage. | text area, 255 chars | `#a0K6g000009yWa6EAE` | yes |
| Is the road damage on a major road? | dropdown Yes/No | `#a0KVt00000FIaf4MAD` | yes |
| Is the road damage the size of a shoe box or larger? | Yes/No, appears after the major-road answer (found by its wording, not a fixed selector) | label contains "shoe box" | yes |
| Additional Information | text area, 255 chars | `[id^=additionalInformation--]` (id ends in a random suffix) | no |
| Upload photos / files | file input (`input[type=file]`), up to 5, 10 MB each, jpeg/png/gif/pdf/Word/Excel | via "Add photos / files" button | no |

## Step 4: Contact

Every field is optional.

| Field | Selector |
| --- | --- |
| File anonymously (checkbox, hides the rest) | `[id$=--anonymousCheck_0]` |
| Single name checkbox | `[id$=--singleNameCheck_0]` |
| First Name / Last Name / Initial | `[id$=--C311_First_Name__c]`, `[id$=--C311_Last_Name__c]`, `[id$=--C311_Initial__c]` |
| Primary Contact Number / Extension | `[id$=--C311_Primary_Contact_Number__c]`, `[id$=--C311_Primary_Extension_Number__c]` |
| Primary Device Type (Mobile/Work/Home) | `[id$=--C311_Primary_Device_Type__c]` |
| Status updates by SMS / Email | `[id$=--C311_Preferred_Notification_Channels__c_0]` (SMS), `..._1` (Email) |
| Survey invitations by SMS / Email | `[id$=--C311_Survey_Pref_Not__c_0]`, `..._1` |
| Email | `[id$=--C311_Email__c]` |
| Street Name / Unit (your home address) | `[id$=--C311_Street_Name__c]`, `[id$=--C311_Unit__c]` |
| Provide mailing address? | `[id$=--mailingcheck_0]` |

For the demo: Mike decides on camera whether to give his name and email (needed for email status updates) or file anonymously. The ids start with a long Salesforce prefix, so match on the end (`$=`).

## Step 5: Review and Submit (where we stopped)

Shows "Summary of your request" with three sections, each with an Edit button: Location (intersection + additional info), Request Information (the three answers), Contact Information.

Buttons: `Previous`, `Cancel`, **`Submit Request`** (this is `#js-button__next` on this step). With `DRY_RUN=true` the bot stops here and takes a screenshot.

Not mapped yet (only a real submit shows it): the confirmation screen and where the tracking number appears. We will capture it on the one real submission.

Screenshots: [location step](screens/05.png), [review screen](screens/12-review.png)

## Friction found (also in `logs/friction.jsonl`)

1. Three separate pothole forms (road, expressway, bike lane). The resident has to know which one.
2. Step 1 is labelled "Terms of Use" in the progress bar, but it's actually a "pick your concern" dropdown with 12 options.
3. The address box only reliably sets the location when you click one of its suggestions. On the City's collection-schedule page, which uses the same address search, while typing "20 Withrow Ave" the suggestion list briefly showed "20 Withrow St", a different street. (An earlier note here said "Find Address" picked 60 Colborne St; that was Mike typing in the same window, not the City's search.)
4. "Is the road damage on a major road?" is required, but residents have no way to know what the City counts as a major road.
5. The location gets asked twice: Step 2 (address) and again in Step 3 ("exact location").
6. Filing anonymously still shows "Primary Device Type: Mobile" on the review screen.
7. Invisible reCAPTCHA on the page. A possible block for any assistant, and for residents using accessibility tools.
8. Every text box is capped at 255 characters.
9. The City's own "Ask the City" AI Assistant was showing "Under Maintenance".
