#!/usr/bin/env python3
"""Expose bounded unit failures in GitHub check annotations without log downloads."""
import os
from pathlib import Path
import sys
import xml.etree.ElementTree as ET


def escape(value):
    return value.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')


path = Path(sys.argv[1])
if not path.is_file():
    print('::warning::Unit test report was not produced; inspect the earlier setup/test step.')
    sys.exit(0)
try:
    tree = ET.parse(path)
except (ET.ParseError, OSError):
    print('::warning::Unit test report could not be read; inspect the test step.')
    sys.exit(0)
cases = list(tree.iter('testcase'))
failures = [(case, list(case.findall('failure')) + list(case.findall('error')))
            for case in cases]
failures = [(case, errors) for case, errors in failures if errors]
for case, errors in failures[:10]:
    detail = '\n'.join(error.get('message', '') + '\n' + (error.text or '')
                       for error in errors)
    print('::error::' + escape((case.get('name', 'Unit test') + '\n' + detail)[:8000]))
summary = f'Unit report: {len(cases)} test cases, {len(failures)} failing cases.'
print(summary)
if os.environ.get('GITHUB_STEP_SUMMARY'):
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as report:
        report.write('## Unit tests\n\n' + summary + '\n')
