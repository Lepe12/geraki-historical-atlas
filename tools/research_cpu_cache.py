"""Do not reuse native CPU wheels across incompatible ephemeral runners."""
import hashlib
import json
import platform
from pathlib import Path
import re
import sysconfig
import uuid


def cache_tag(cpuinfo=None):
    if cpuinfo is None:
        try:cpuinfo=Path('/proc/cpuinfo').read_text()
        except OSError:cpuinfo=''
    models=sorted(set(re.findall(r'^model name\s*:\s*(.+)$',cpuinfo,re.M)))
    flags=sorted(set(' '.join(re.findall(r'^(?:flags|Features)\s*:\s*(.+)$',cpuinfo,re.M)).split()))
    if not models or not flags:
        # Unknown capabilities must never share a native binary cache.
        return 'unidentified-'+uuid.uuid4().hex
    profile={'models':models,'flags':flags,'architecture':platform.machine(),
             'python_abi':sysconfig.get_config_var('SOABI'),'libc':platform.libc_ver()}
    return hashlib.sha256(json.dumps(profile,sort_keys=True).encode()).hexdigest()[:24]


if __name__=='__main__':print(cache_tag())
