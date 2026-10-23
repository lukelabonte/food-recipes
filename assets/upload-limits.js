// Base64 expands 7.5 MB to 10 MB, the Claude API's per-image limit.
// https://platform.claude.com/docs/en/build-with-claude/vision#request-limits
export const MAX_UPLOAD_BYTES = 7_500_000;
export const UPLOAD_SIZE_ERROR = 'This file is too large. The maximum file size is 7.5 MB. Choose a smaller photo or PDF, or remove the file to upload just the recipe text.';
