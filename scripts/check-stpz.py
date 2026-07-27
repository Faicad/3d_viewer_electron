"""Validate STPZ file is a standard ZIP with a STEP entry inside."""
import sys
import zipfile

def check(stpz_path: str) -> int:
    try:
        with zipfile.ZipFile(stpz_path, 'r') as z:
            # Check for bad CRC / corrupt entries
            bad = z.testzip()
            if bad:
                print(f'FAIL: corrupt entry: {bad}')
                return 1

            entries = z.namelist()
            print(f'Valid ZIP, {len(entries)} entries: {entries}')

            step_entries = [e for e in entries if e.lower().endswith('.stp') or e.lower().endswith('.step')]
            if not step_entries:
                print(f'FAIL: no .stp/.step entry found')
                return 1

            for name in step_entries:
                info = z.getinfo(name)
                data = z.read(name)
                header = data[:200].decode('ascii', errors='replace')
                print(f'  {name}  ({len(data)} bytes, compressed={info.compress_size})')
                print(f'  header: {header[:120]}...')
            return 0

    except zipfile.BadZipFile as e:
        print(f'FAIL: not a valid ZIP — {e}')
        return 1
    except FileNotFoundError:
        print(f'FAIL: file not found: {stpz_path}')
        return 1

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python scripts/check-stpz.py <file.stpz>')
        sys.exit(1)
    sys.exit(check(sys.argv[1]))
