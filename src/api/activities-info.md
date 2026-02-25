# MASV Activities

## General Information

MASV Activities are records of events that happened with MASV resourses like packages, transfers and links.

Activities has states:

- pending
- started
- complete
- cancelled
- error

Activities could transition between states back and forth multiple times.
Each activity contains a list of events corresponding to states transitions every time it changes it's state.
Usually activities start in "pending" state and finish in either "complete", "cancelled" or "error", but there are exceptions.

## Full list of activities and description of their states

### package_upload_to_masv

"package_upload_to_masv" activity is created when new package is created. This can be user uploading package via MASV web app, desktop app or MASV Agent or package can be transferred from connected cloud or on-prem storage integration like AWS S3, Azure or MASV Storage Gateway.

- pending - package was created, no files were added yet.
- started - first file was added to the package. That usually mean that upload started and is in progress now.
- complete - package successfully finalized and is available at MASV.
- cancelled - package upload was cancelled. Package was deleted from MASV.
- error - error happened during package upload. For additional information see error message attached in "extras" field of activity. Package was deleted from MASV.

### package_download_from_masv

"package_download_from_masv" activity is created when user starts downloading MASV package. Note that if package is sent to connected storage integration another activity "package_transfer_masv_to_cloud" is created.

- pending and started - once user started downloading first file from the package activity switched to "pending" and then immediately to "started" state. "pending" state on its own doesnt have any meaning and is not used for this activity.
- complete - activity transitioned to "complete" state only if user downloaded all of the files from the package and MASV received confirmation from supported clients. If user only downloaded subset of files activity will stay in "started" state. Supported clients that confirm download are: MASV Desktop app, MASV Agent and MASV download with new "zipless" web download page (legacy web download page will not switch activity to "complete" state because we cant get confirmation of that download).
- cancelled - this state is never used for this activity.
- error - error happened during package download. For additional information see error message attached in "extras" field of the activity.

### link_generation

"link_generation" activity is added when new download link is added to the package.

- pending - new download link was added to the package.
- started - someone opened download link and possibly started downloading the package.
- complete - same as for "package_download_from_masv" activity transitioned to "complete" state only if user downloaded all of the files from the package and MASV received confirmation from supported clients. If user only downloaded subset of files activity will stay in "started" state. Supported clients that confirm download are: MASV Desktop app, MASV Agent and MASV download with new "zipless" web download page (legacy web download page will not switch activity to "complete" state because we cant get confirmation of that download).
- cancelled - not used for "link_generation" activity.
- error - same as for "package_download_from_masv" error happened during package download. For additional information see error message attached in "extras" field of the activity.

### package_transfer_masv_to_cloud

"package_transfer_masv_to_cloud" activity is created when package is sent from MASV to connected cloud or on-prem storage integration like AWS S3, Azure or MASV Storage Gateway.

- pending - not used for "package_transfer_masv_to_cloud" activity.
- started - transfer has started.
- complete - transfer has completed.
- cancelled - transfer was cancelled.
- error - transfer error. For additional information see error message attached in "extras" field of the activity.
