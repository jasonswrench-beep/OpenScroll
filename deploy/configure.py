#!/usr/bin/env python3
"""Create an exclusive, private deployment configuration without printing secrets."""
from pathlib import Path
import fcntl,os,re,secrets,stat,sys,tempfile

root=Path(__file__).resolve().parent
path=Path(os.environ.get('OPENSCROLL_ENV_FILE',root/'.env.production')).absolute()
role_keys=('MIGRATOR_DB_PASSWORD','RUNTIME_DB_PASSWORD')

def check_hba():
    value=(root/'pg_hba.conf').lstat()
    if not stat.S_ISREG(value.st_mode) or value.st_mode&0o444!=0o444 or value.st_mode&0o022:
        raise ValueError('The public pg_hba.conf template must be a regular, readable file (mode 644), without group/world write permission.')
    print('Public PostgreSQL access policy permissions checked.')

def private_file(fd):
    value=os.fstat(fd)
    if not stat.S_ISREG(value.st_mode) or value.st_uid!=os.geteuid() or value.st_mode&0o077:
        raise ValueError('Configuration must be a private regular file owned by this operator.')
    return value

def add_roles():
    # Serialize our own changes, preserve every existing setting, and replace atomically.
    if path.parent.stat().st_mode&0o022:
        raise ValueError('Keep deployment configuration in an operator-controlled directory.')
    lock=os.open(str(path)+'.db-roles.lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    try:
        private_file(lock)
        fcntl.flock(lock,fcntl.LOCK_EX)
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
        with os.fdopen(fd,'r') as source:
            original=private_file(source.fileno())
            text=source.read()
        found={}
        for line in text.splitlines():
            match=re.match(r'^\s*(?:export\s+)?(MIGRATOR_DB_PASSWORD|RUNTIME_DB_PASSWORD)\s*=(.*)$',line)
            if not match:continue
            key,value=match.groups()
            value=value.strip()
            if len(value)>1 and value[0]==value[-1] and value[0] in "'\"":value=value[1:-1]
            if key in found or not re.fullmatch('[0-9a-fA-F]{64}',value):
                raise ValueError('Existing database role credentials are duplicate or invalid; review the private file.')
            found[key]=value
        missing=[key for key in role_keys if key not in found]
        if len(set(found.values()))!=len(found):
            raise ValueError('Database login passwords must be different.')
        if not missing:
            print('Database role credentials already exist; no configuration changed.')
            return
        if text and not text.endswith('\n'):text+='\n'
        text+='\n# Separate database role credentials; keep these values unchanged on repeat provisioning.\n'
        for key in missing:text+=key+'='+secrets.token_hex(32)+'\n'
        fd,name=tempfile.mkstemp(prefix='.db-roles-',dir=path.parent)
        try:
            with os.fdopen(fd,'w') as target:
                os.fchmod(target.fileno(),0o600)
                target.write(text);target.flush();os.fsync(target.fileno())
            current=path.lstat()
            if (current.st_dev,current.st_ino)!=(original.st_dev,original.st_ino):
                raise ValueError('Configuration changed concurrently; no replacement made.')
            os.replace(name,path)
            directory=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
            try:os.fsync(directory)
            finally:os.close(directory)
        finally:
            if os.path.exists(name):os.unlink(name)
        print('Added missing database role credentials privately; existing settings and bootstrap password preserved.')
    finally:os.close(lock)

try:
    if sys.argv[1:]==['--check-hba']:
        check_hba()
    elif sys.argv[1:]==['--add-database-roles']:
        add_roles()
    elif not sys.argv[1:]:
        text=(root/'env.example').read_text()
        for token in ('REPLACE_WITH_64_RANDOM_HEX_CHARACTERS','REPLACE_WITH_MIGRATOR_64_HEX','REPLACE_WITH_RUNTIME_64_HEX'):
            text=text.replace(token,secrets.token_hex(32))
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'w') as target:target.write(text)
        print('Created private deployment configuration (mode 600). Set hostname and SMTP values before starting.')
    else:
        raise ValueError('Usage: configure.py [--add-database-roles|--check-hba]')
except (OSError,ValueError):
    if sys.argv[1:]==['--check-hba']:
        print('PostgreSQL policy refused. Keep the public deploy/pg_hba.conf template a regular file with mode 644; keep private deployment credentials at mode 600.',file=sys.stderr)
    else:
        print('Configuration update refused. Check file ownership, private permissions, path, and existing role fields; no secrets are printed.',file=sys.stderr)
    sys.exit(1)
