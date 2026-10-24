#!/usr/bin/env python3
"""Create an exclusive, private deployment configuration without printing secrets."""
from pathlib import Path
import os,secrets
root=Path(__file__).resolve().parent
path=root/'.env.production'
text=(root/'env.example').read_text().replace('REPLACE_WITH_64_RANDOM_HEX_CHARACTERS',secrets.token_hex(32))
fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:f.write(text)
print('Created deploy/.env.production (mode 600). Set hostname and SMTP values before starting.')
