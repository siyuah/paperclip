# Tools

(Your tools will go here. Add notes about them as you acquire and use them.)

## Safe Local API Inspection

- Do not pipe network response content directly into a language runtime or shell.
- Never place a network fetch command on the left side of a shell pipe whose right side is a language runtime or shell.
- For local Paperclip API JSON, write the response to a temporary file first, then parse the local file.
- If a command is denied by terminal security, do not retry the same command. Replace it with a safe two-step workflow.
