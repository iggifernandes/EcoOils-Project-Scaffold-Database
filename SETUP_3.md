SCAFFOLD INSPECTION DATABASE v1.0.0 — GO-LIVE GUIDE
=====================================================

Files
• Code.gs         backend (Google Apps Script, bound to a Google Sheet)
• appsscript.json manifest (time zone Asia/Jakarta, web app settings)
• index.html      the app (GitHub Pages)

STEP 1 — Backend (about 10 minutes). Use your PERSONAL Gmail, not the work email.
• Create a Google Sheet named "EcoOils Scaffold Database".
• Extensions > Apps Script. Delete the default code and paste all of Code.gs.
• Project Settings (gear icon) > tick "Show appsscript.json manifest file in editor". Open appsscript.json and paste the contents of the supplied appsscript.json.
• In Code.gs, set ADMIN_EMAIL (line 9) to the email you will log in with. Save.
• Select the function setup in the toolbar and press Run. Approve the permissions (Sheets, Drive, Gmail send, triggers). This creates all tabs, the Drive photo folder, and the 07:00 daily reminder trigger.
• Deploy > New deployment > type Web app > Execute as: Me > Who has access: Anyone > Deploy. Copy the Web app URL (ends in /exec).

STEP 2 — App (about 5 minutes)
• Create a GitHub repo EcoOils-Project-Scaffold-Database under iggifernandes. Upload index.html.
• Open index.html, replace PASTE_APPS_SCRIPT_WEB_APP_URL_HERE with the /exec URL, commit.
• Settings > Pages > deploy from branch main, root.
• (Alternative without editing the file: open the site, paste the URL on the first screen; it is saved on that device only.)

STEP 3 — First use
• Open the site, log in with ADMIN_EMAIL: the 6-digit code arrives by email.
• Supervisors tab > Add supervisor (or Import list). Adding a supervisor with an email also creates their login.
• Admin tab > Add user for inspectors (role: inspector) and anyone who only needs to view (role: viewer).
• Test: log in as a supervisor, New scaffold, note the ID, then log in as an inspector and do the Handover inspection with a tag photo.

HOW IT WORKS
• ID format: CONTRACTOR-TYPE-YYMM-NNN, e.g. PBS-T-2610-001. Running number counts per contractor per month across all types.
• New scaffold = Pending (must not be used). Handover inspection passed = Active. Any failed item = Do not use. Missed weekly date = Overdue. Dismantled = closed.
• Only an Approved supervisor with an unexpired certificate, from the same contractor, can be chosen as "built by".
• Handover needs the FRONT tag photo. Weekly and Special need the BACK (inspection grid) photo. Every failed item needs a comment.
• Photos go to Drive: "EcoOils Scaffold Inspection Photos" / one subfolder per scaffold ID. Viewing a photo goes through the app, so supervisors do not need Drive access.
• Reminders run daily at 07:00 Jakarta time: 1 day before and on the due day, daily when overdue or Do not use, supervisor certificates at 30/14/7/1/0 days. Each reminder is emailed automatically AND added to the Reminders tab as a ready-made WhatsApp message (Bahasa Indonesia) that you tap to send. You also get a daily digest email. Phone numbers are converted to +62 format (08… becomes 628…).
• Roles: admin (everything), inspector (all inspections, new-scaffold notices), supervisor (own contractor: register scaffolds, weekly inspections), viewer (read only).

THINGS TO CONFIRM (all are settings or one-line changes)
• Checklist items are generic good-practice items, not the Shell / Mentari standard. Compare with your procedure and tell me what to change.
• Weekly interval is set to 7 days (Admin > Settings).
• Scaffold types in the list: T, S, M, H, X. Edit under Admin > Settings once you know which are used.
• Pending-inspection alert goes to all inspectors and admins.
• Supervisors may do Weekly inspections; Handover and Special are inspector/admin only.

LIMITS
• Free Gmail sends about 100 emails a day. The app stops at 80 per reminder run. Fully automatic WhatsApp would need the paid WhatsApp Business API, so it is tap-to-send for now.
• The GitHub repo is public, but all data sits behind email-code login. No data is stored in the repo.
