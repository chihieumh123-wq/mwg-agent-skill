#!/bin/sh
# chrome-profile luôn mở tab mới (--force) để không đụng tab CMS user đang sửa
exec chrome-profile "$@" --force
