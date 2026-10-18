# Backup toolbox: rclone (Google Drive), age (encryption) and jq (the manifest), pinned so the nightly job never
# changes underneath it. Nothing is installed on the server itself.
FROM rclone/rclone:1.71
RUN apk add --no-cache age jq
# The base image's entrypoint is rclone itself; clear it so each call names its program.
ENTRYPOINT []
