SCAFFOLD INSPECTION DATABASE v1.1.6 — GO-LIVE GUIDE
=====================================================

WHAT IS NEW IN v1.1.6
• Scaffolder Helper: needs Scaffolding Basic Awareness and Working at Height training (internal or external). No external certificate needed. Without both: "Training incomplete". Expiry reminders cover these trainings too.
• Every certificate/training submission (scaffolders and supervisors, single or import) needs the tick "I have verified the certificate and all data is true and checked", then a confirmation pop-up.
• Submitted records are locked. Renew = new certificate with new photo. Admin can unlock with a reason (logged); it must be verified again. Every submission is kept on the new Submissions tab.
• Upgrade: paste Code.gs, run setup once, Deploy > Manage deployments > New version.

WHAT IS NEW IN v1.1.3
• Main Location is now a dropdown of the 35 locations from the UA/UC Report app (preloaded). Admin > Settings > Main locations lets you edit the list, or press "Sync from UA/UC Report app" to pull the latest list and then Save.
• Sub Location is entered by the INSPECTOR at the Handover inspection (required). It then shows next to the main location everywhere (lists, detail, CSV, reminders).
• All fields are mandatory: new scaffold (main location, requested by, built by, date, load class, notes), Handover sub location, and overall comments on every inspection. Checklist items, tag photos and failed-item comments were already required.
• Upgrade: paste the new Code.gs, run setup once (adds the new column and location list), Deploy > Manage deployments > New version. Replace index.html on GitHub (done for you), hard-refresh.
• Existing scaffolds keep their old location text as Main Location; their Sub Location stays empty.

UPGRADING FROM v1.0.0 (already pasted the old Code.gs)
• Apps Script: select all in Code.gs, paste the new Code.gs, save. Run setup again (safe to repeat: it adds the new Scaffolders tab and keeps your data).
• Deploy > Manage deployments > pencil icon > Version: New version > Deploy. The /exec URL stays the same.
• GitHub: replace index.html with the new one and put your /exec URL in it again. Hard-refresh the site.

FIXES IN v1.1.1
• A scaffold that failed its handover can no longer be cleared with the short weekly checklist; it needs a full Handover pass first. Once passed, handover cannot be repeated.
• Sheets no longer stop saving after 1000 rows (it would have failed after a few months of weekly inspections).
• Login codes: one email per minute per address, so nobody can use up the daily mail quota.
• Supervisors cannot start a handover (inspectors only) and now see a clear message instead of filling in 25 items first.
• New-scaffold form warns when the contractor has no approved supervisor.
• Photos upload no longer times out when several people save at once.
• Moving a supervisor to another contractor also moves their login scope.
• Readable error if the web app URL or access setting is wrong; Retry button on a network drop; answer highlighting works on older phone browsers.

WHAT IS NEW IN v1.1.0
• Scaffolders tab: the crew register. Name, contractor, grade, phone, certificate type / number / issue / expiry, photo of the scaffolder and photo of the certificate. Certificate fields can be empty for people without one yet; they show as "No certificate".
• Admin adds or edits people one by one, or pastes a list under Import names (one per line: name, contractor, grade, phone, certType, certNo, issueDate, expiryDate).
• Inspectors and viewers can see everyone; supervisors see their own contractor only; only admin sees phone numbers.
• Certificate expiry reminders (30/14/7/1/0 days) now cover scaffolders as well as supervisors, and the daily digest lists expired certificates and, on Mondays, people with no certificate on file.

Files
• Code.gs         backend (Google Apps Script, bound to a Google Sheet)
• appsscript.json manifest (time zone Asia/Jakarta, web app settings)
• index.html      the app (GitHub Pages)

STEP 1 — Backend (about 10 minutes). Use your PERSONAL Gmail, not the work email.
• Create a Google Sheet named "EcoOils Scaffold Database".
• Extensions > Apps Script. Delete the default code and paste all of Code.gs.
• Project Settings (gear icon) > tick "Show appsscript.json manifest file in editor". Open appsscript.json and paste the contents of the supplied appsscript.json.
• In Code.gs, check ADMIN_EMAIL (line 7). It is already set to Ignatius.Ambrosio@ecooils.com.my; change it only if you want to log in with another email. Keep the straight quotes and the semicolon. Save.
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
