import type { UIEventStateContext } from '@blocksuite/block-std';
import { PathFinder } from '@blocksuite/block-std';
import { assertExists } from '@blocksuite/global/utils';
import type { BlockElement } from '@blocksuite/lit';
import type { VEditor, VirgoRootElement } from '@blocksuite/virgo';

import { getNextBlock } from '../../../note-block/utils.js';
import { bracketPairs } from '../../../page-block/const/bracket-pairs.js';
import { inlineFormatConfig } from '../../../page-block/const/inline-format-config.js';
import type { PageBlockComponent } from '../../../page-block/types.js';
import {
  getCombinedFormatInTextSelection,
  getSelectedContentModels,
} from '../../../page-block/utils/selection.js';
import { checkFirstLine, checkLastLine } from '../../utils/check-line.js';
import { matchFlavours } from '../../utils/model.js';
import { tryConvertBlock } from '../markdown-convert.js';
import {
  handleIndent,
  handleMultiBlockIndent,
  handleMultiBlockUnindent,
  handleUnindent,
} from '../rich-text-operations.js';
import { hardEnter, onBackspace, onForwardDelete } from './legacy.js';

export const bindContainerHotkey = (blockElement: BlockElement) => {
  const selection = blockElement.root.selectionManager;
  const model = blockElement.model;

  const _selectBlock = () => {
    selection.update(selList => {
      return selList.map(sel => {
        if (PathFinder.equals(sel.path, blockElement.path)) {
          return selection.getInstance('block', { path: blockElement.path });
        }
        return sel;
      });
    });
    blockElement.querySelector<VirgoRootElement>('[data-virgo-root]')?.blur();
    return true;
  };

  const _selectText = (start: boolean) => {
    selection.update(selList => {
      return selList.map(sel => {
        if (PathFinder.equals(sel.path, blockElement.path)) {
          return selection.getInstance('text', {
            from: {
              path: blockElement.path,
              index: start ? 0 : blockElement.model.text?.length ?? 0,
              length: 0,
            },
            to: null,
          });
        }
        return sel;
      });
    });
    return true;
  };

  const _getVirgo = () => {
    const vRoot =
      blockElement.querySelector<VirgoRootElement>('[data-virgo-root]');
    if (!vRoot) {
      throw new Error('Virgo root not found');
    }
    return vRoot.virgoEditor;
  };

  const _getPrefixText = (vEditor: VEditor) => {
    const vRange = vEditor.getVRange();
    assertExists(vRange);
    const [leafStart, offsetStart] = vEditor.getTextPoint(vRange.index);
    return leafStart.textContent
      ? leafStart.textContent.slice(0, offsetStart)
      : '';
  };

  const _preventDefault = (ctx: UIEventStateContext) => {
    const state = ctx.get('defaultState');
    state.event.preventDefault();
  };

  const _selectAllText = () => {
    selection.update(selList => {
      return selList.map(sel => {
        if (PathFinder.equals(sel.path, blockElement.path)) {
          return selection.getInstance('text', {
            from: {
              path: blockElement.path,
              index: 0,
              length: blockElement.model.text?.length ?? 0,
            },
            to: null,
          });
        }
        return sel;
      });
    });
    return true;
  };

  blockElement.bindHotKey({
    ArrowUp: ctx => {
      if (blockElement.selected?.is('text')) {
        const vEditor = _getVirgo();
        const vRange = vEditor.getVRange();
        assertExists(vRange);

        if (vRange.length !== 0) {
          vEditor.setVRange({
            index: vRange.index,
            length: 0,
          });
        }

        const range = vEditor.toDomRange({
          index: vRange.index,
          length: 0,
        });
        assertExists(range);
        if (checkFirstLine(range, vEditor.rootElement)) {
          _preventDefault(ctx);
          return;
        }

        return true;
      }

      return;
    },
    ArrowDown: ctx => {
      if (blockElement.selected?.is('text')) {
        const vEditor = _getVirgo();
        const vRange = vEditor.getVRange();
        assertExists(vRange);

        if (vRange.length !== 0) {
          vEditor.setVRange({
            index: vRange.index,
            length: 0,
          });
        }

        const range = vEditor.toDomRange({
          index: vRange.index,
          length: 0,
        });
        assertExists(range);
        if (checkLastLine(range, vEditor.rootElement)) {
          if (getNextBlock(blockElement)) {
            _preventDefault(ctx);
          }
          return;
        }

        return true;
      }

      return;
    },
    ArrowRight: ctx => {
      if (blockElement.selected?.is('block')) {
        return _selectText(false);
      }

      if (blockElement.selected?.is('text')) {
        const vEditor = _getVirgo();
        const vRange = vEditor.getVRange();
        assertExists(vRange);

        if (vRange.length === 0 && vRange.index === vEditor.yText.length) {
          _preventDefault(ctx);
          return;
        }

        return true;
      }

      return;
    },
    ArrowLeft: ctx => {
      if (blockElement.selected?.is('block')) {
        return _selectText(true);
      }

      if (blockElement.selected?.is('text')) {
        const vEditor = _getVirgo();
        const vRange = vEditor.getVRange();
        assertExists(vRange);

        if (vRange.length === 0 && vRange.index === 0) {
          _preventDefault(ctx);
          return;
        }

        return true;
      }

      return;
    },
    Escape: () => {
      if (blockElement.selected?.is('text')) {
        return _selectBlock();
      }
      return;
    },
    Enter: ctx => {
      const state = ctx.get('keyboardState');

      if (blockElement.selected?.is('block')) {
        return _selectText(false);
      }

      if (blockElement.selected?.is('text')) {
        blockElement.model.page.captureSync();

        const vEditor = _getVirgo();
        const vRange = vEditor.getVRange();
        assertExists(vRange);

        if (
          !tryConvertBlock(
            model.page,
            model,
            vEditor,
            _getPrefixText(vEditor),
            vRange
          )
        ) {
          _preventDefault(ctx);
          return true;
        }

        hardEnter(model, vRange, vEditor, state.raw);
        _preventDefault(ctx);

        return true;
      }

      return;
    },
    'Shift-Enter': () => {
      if (blockElement.selected?.is('text')) {
        const vEditor = _getVirgo();
        const vRange = vEditor.getVRange();
        assertExists(vRange);
        vEditor.insertText(vRange, '\n');
        vEditor.setVRange({
          index: vRange.index + 1,
          length: 0,
        });

        return true;
      }

      return;
    },
    'Mod-Enter': ctx => {
      const state = ctx.get('keyboardState');

      if (blockElement.selected?.is('text')) {
        const vEditor = _getVirgo();
        const vRange = vEditor.getVRange();
        assertExists(vRange);
        hardEnter(model, vRange, vEditor, state.raw, true);
        _preventDefault(ctx);

        return true;
      }

      return;
    },
    Space: ctx => {
      if (blockElement.selected?.is('text')) {
        const vEditor = _getVirgo();
        const vRange = vEditor.getVRange();
        assertExists(vRange);

        const prefixText = _getPrefixText(vEditor);

        if (!tryConvertBlock(model.page, model, vEditor, prefixText, vRange)) {
          _preventDefault(ctx);
        }

        return true;
      }

      return;
    },
    'Mod-a': ctx => {
      ctx.get('defaultState').event.preventDefault();
      if (blockElement.selected?.is('text')) {
        const text = blockElement.selected;
        const virgo =
          blockElement.querySelector<VirgoRootElement>('[data-virgo-root]');
        if (
          text.from.index === 0 &&
          text.from.length === virgo?.virgoEditor.yText.length
        ) {
          return _selectBlock();
        }

        return _selectAllText();
      }
      return;
    },
    Tab: ctx => {
      if (
        blockElement.selected?.is('block') ||
        blockElement.selected?.is('text')
      ) {
        const page = blockElement.closest<PageBlockComponent>(
          'affine-doc-page,affine-edgeless-page'
        );
        if (!page) {
          return;
        }

        const textModels = getSelectedContentModels(page, ['text']);
        if (textModels.length === 1) {
          const vEditor = _getVirgo();
          const vRange = vEditor.getVRange();
          assertExists(vRange);
          handleIndent(model.page, model, vRange.index);
          _preventDefault(ctx);

          return true;
        }

        const models = getSelectedContentModels(page, ['text', 'block']);
        handleMultiBlockIndent(blockElement.page, models);
        return true;
      }
      return;
    },
    'Shift-Tab': ctx => {
      if (
        blockElement.selected?.is('block') ||
        blockElement.selected?.is('text')
      ) {
        const page = blockElement.closest<PageBlockComponent>(
          'affine-doc-page,affine-edgeless-page'
        );
        if (!page) {
          return;
        }

        const textModels = getSelectedContentModels(page, ['text']);
        if (textModels.length === 1) {
          const vEditor = _getVirgo();
          const vRange = vEditor.getVRange();
          assertExists(vRange);
          handleUnindent(model.page, model, vRange.index);
          _preventDefault(ctx);

          return true;
        }

        const models = getSelectedContentModels(page, ['text', 'block']);
        handleMultiBlockUnindent(blockElement.page, models);
        return true;
      }
      return;
    },
    Backspace: ctx => {
      if (blockElement.selected?.is('text')) {
        const state = ctx.get('keyboardState');
        const vEditor = _getVirgo();
        if (!onBackspace(model, state.raw, vEditor)) {
          _preventDefault(ctx);
        }

        return true;
      }

      return;
    },
    Delete: ctx => {
      if (blockElement.selected?.is('text')) {
        const state = ctx.get('keyboardState');
        const vEditor = _getVirgo();
        if (!onForwardDelete(model, state.raw, vEditor)) {
          _preventDefault(ctx);
        }
        return true;
      }

      return;
    },
  });

  inlineFormatConfig.forEach(config => {
    if (!config.hotkey) return;

    blockElement.bindHotKey({
      [config.hotkey]: ctx => {
        if (blockElement.page.readonly) return;

        const textSelection = blockElement.selection.find('text');
        if (!textSelection) return;

        _preventDefault(ctx);

        const format = getCombinedFormatInTextSelection(
          blockElement,
          textSelection
        );
        config.action({ blockElement, type: 'text', format });
        return true;
      },
    });
  });

  bracketPairs.forEach(pair => {
    blockElement.bindHotKey({
      [pair.left]: ctx => {
        if (blockElement.page.readonly) return;

        const textSelection = blockElement.selection.find('text');
        if (
          !textSelection ||
          (textSelection.isCollapsed() &&
            !matchFlavours(blockElement.model, ['affine:code']))
        )
          return;

        _preventDefault(ctx);

        const vEditor = _getVirgo();
        const vRange = vEditor.getVRange();
        assertExists(vRange);
        const selectedText = vEditor.yText
          .toString()
          .slice(vRange.index, vRange.index + vRange.length);
        vEditor.insertText(vRange, pair.left + selectedText + pair.right);

        vEditor.setVRange({
          index: vRange.index + 1,
          length: vRange.length,
        });

        return true;
      },
    });
  });

  blockElement.bindHotKey({
    '`': ctx => {
      if (blockElement.page.readonly) return;

      const textSelection = blockElement.selection.find('text');
      if (!textSelection || textSelection.isCollapsed()) return;

      _preventDefault(ctx);

      const vEditor = _getVirgo();
      const vRange = vEditor.getVRange();
      assertExists(vRange);
      vEditor.formatText(vRange, { code: true });

      vEditor.setVRange({
        index: vRange.index,
        length: vRange.length,
      });

      return true;
    },
  });
};
