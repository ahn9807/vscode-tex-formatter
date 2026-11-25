import importlib.util
from pathlib import Path
import sys
import unittest

path = Path(__file__).resolve().parents[1] / 'install_global.py'
spec = importlib.util.spec_from_file_location('install_global', path)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)


class SettingsTests(unittest.TestCase):
    def test_empty_settings(self):
        result = module.patch_settings('{}\n')
        node = module.parse_jsonc(result)
        self.assertEqual(set(node.properties), {'[latex]', '[tex]'})
        self.assertEqual(result.count('local.latex-prose-wrap'), 2)
        self.assertNotIn('formatOnSave', result)

    def test_comments_trailing_commas_and_other_settings_survive(self):
        original = '''{
  // Keep this comment and setting.
  "editor.formatOnSave": false,
  "[latex]": {
    "editor.defaultFormatter": "other.extension", // Keep this too.
    "editor.tabSize": 4,
  },
  "array": ["url://example", {"tricky": "comma,}"}],
}
'''
        result = module.patch_settings(original)
        for literal in ['// Keep this comment and setting.', '// Keep this too.', '"editor.formatOnSave": false', '"editor.tabSize": 4', '"array": ["url://example", {"tricky": "comma,}"}]']:
            self.assertIn(literal, result)
        self.assertNotIn('other.extension', result)
        self.assertEqual(module.patch_settings(result), result)

    def test_insert_into_existing_inline_objects(self):
        original = '{"[latex]": {"editor.tabSize": 4}, "[tex]": {}}'
        result = module.patch_settings(original)
        self.assertEqual(result.count('local.latex-prose-wrap'), 2)
        module.parse_jsonc(result)

    def test_invalid_settings_fail_before_mutating(self):
        for original in ['[]', '{"[latex]": true}', '{"broken": }']:
            with self.assertRaises((ValueError, IndexError)):
                module.patch_settings(original)


if __name__ == '__main__':
    unittest.main()
