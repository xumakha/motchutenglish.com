"""Private local media backup and non-destructive restore drill. Python >= 3.12."""
import datetime,json,secrets,sys,tarfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
backups=root/'writable/backups';backups.mkdir(parents=True,exist_ok=True)
action=sys.argv[1] if len(sys.argv)>1 else 'backup'
if action=='backup':
    media=root/'writable/media';media.mkdir(parents=True,exist_ok=True)
    file=backups/('media-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S')+'-'+secrets.token_hex(4)+'.tar.gz');count=0
    with tarfile.open(file,'w:gz') as archive:
        for asset in media.rglob('*'):
            if asset.is_symlink() or not asset.is_file():continue
            asset.resolve().relative_to(media.resolve());archive.add(asset,arcname=str(asset.relative_to(media)),recursive=False);count+=1
    file.chmod(0o600);print(json.dumps(dict(file=str(file),files=count)))
elif action=='restore':
    file=Path(sys.argv[2]).resolve();file.relative_to(backups.resolve())
    target=root/'writable'/('media-restore-'+secrets.token_hex(8));target.mkdir(mode=0o700)
    with tarfile.open(file,'r:gz') as archive:
        members=archive.getmembers()
        for member in members:
            if not member.isfile() or Path(member.name).is_absolute() or '..' in Path(member.name).parts:raise ValueError('Unsafe archive entry')
            (target/member.name).resolve().relative_to(target.resolve())
        archive.extractall(target,members=members,filter='data')
    print(json.dumps(dict(directory=str(target),files=len(members),originalMediaUnchanged=True)))
else:raise SystemExit('Usage: python database/media-backup.py backup|restore ARCHIVE')
