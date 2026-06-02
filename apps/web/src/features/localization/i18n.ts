import i18n from "i18next";
import {initReactI18next} from "react-i18next";

export const resources = {
  en: {
    translation: {
      app: {
        title: "Uro SGF Editor",
        dirty: "Modified",
        clean: "Saved",
        move: "Move {{count}}",
        next: "Next {{color}}",
        black: "Black",
        white: "White"
      },
      menu: {
        file: "File",
        new: "New",
        new19: "New 19x19",
        new13: "New 13x13",
        new9: "New 9x9",
        open: "Open",
        save: "Save",
        importSgf: "Import SGF",
        exportSgf: "Export SGF",
        editGameInfo: "Game info",
        language: "Language",
        coordinates: "Coordinates",
        numbers: "Numbers"
      },
      nav: {
        first: "First move",
        previous10: "Previous 10 moves",
        previous: "Previous move",
        next: "Next move",
        next10: "Next 10 moves",
        last: "Last move"
      },
      tools: {
        auto: "Alternate play",
        pass: "Pass",
        black: "Place black stone",
        white: "Place white stone",
        erase: "Erase",
        number: "Number label",
        alphabet: "Alphabet label",
        circle: "Circle",
        square: "Square",
        triangle: "Triangle",
        cross: "Cross",
        selected: "Selected point"
      },
      panels: {
        comments: "Comments",
        tree: "SGF tree",
        gameInfo: "Game information"
      },
      savedGames: {
        openTitle: "Open saved game",
        gameName: "Game name",
        date: "Date",
        blackPlayer: "Black",
        whitePlayer: "White",
        result: "Result",
        saved: "Game saved",
        saveFailed: "Failed to save game.",
        openFailed: "Failed to open saved game.",
        deleteFailed: "Failed to delete saved game.",
        loadListFailed: "Failed to load saved games."
      },
      gameInfo: {
        PB: "Black player",
        PW: "White player",
        BR: "Black rank",
        WR: "White rank",
        EV: "Event",
        RO: "Round",
        DT: "Date",
        PC: "Place",
        KM: "Komi",
        HA: "Handicap",
        RU: "Rules",
        RE: "Result",
        GN: "Game name",
        GC: "Game comment"
      },
      prompt: {
        number: "Number label",
        alphabet: "Alphabet label"
      },
      action: {
        ok: "OK",
        cancel: "Cancel",
        open: "Open",
        delete: "Delete"
      }
    }
  },
  zh: {
    translation: {
      app: {
        title: "Uro SGF 编辑器",
        dirty: "已修改",
        clean: "已保存",
        move: "第 {{count}} 手",
        next: "下一手 {{color}}",
        black: "黑",
        white: "白"
      },
      menu: {
        file: "文件",
        new: "新建",
        new19: "新建 19 路",
        new13: "新建 13 路",
        new9: "新建 9 路",
        open: "打开",
        save: "保存",
        importSgf: "导入 SGF",
        exportSgf: "导出 SGF",
        editGameInfo: "棋局信息",
        language: "语言",
        coordinates: "坐标",
        numbers: "手数"
      },
      nav: {
        first: "第一手",
        previous10: "前 10 手",
        previous: "前一手",
        next: "后一手",
        next10: "后 10 手",
        last: "最后一手"
      },
      tools: {
        auto: "黑白交替",
        pass: "停一手",
        black: "放置黑子",
        white: "放置白子",
        erase: "擦除",
        number: "数字标记",
        alphabet: "字母标记",
        circle: "圆形",
        square: "方形",
        triangle: "三角",
        cross: "叉形",
        selected: "选点"
      },
      panels: {
        comments: "注释",
        tree: "SGF 树",
        gameInfo: "棋局信息"
      },
      savedGames: {
        openTitle: "打开已保存棋谱",
        gameName: "棋谱名称",
        date: "日期",
        blackPlayer: "黑方",
        whitePlayer: "白方",
        result: "结果",
        saved: "棋谱已保存",
        saveFailed: "保存棋谱失败。",
        openFailed: "打开已保存棋谱失败。",
        deleteFailed: "删除已保存棋谱失败。",
        loadListFailed: "读取已保存棋谱失败。"
      },
      gameInfo: {
        PB: "黑方",
        PW: "白方",
        BR: "黑方段位",
        WR: "白方段位",
        EV: "赛事",
        RO: "轮次",
        DT: "日期",
        PC: "地点",
        KM: "贴目",
        HA: "让子",
        RU: "规则",
        RE: "结果",
        GN: "棋谱名称",
        GC: "棋谱说明"
      },
      prompt: {
        number: "数字标记",
        alphabet: "字母标记"
      },
      action: {
        ok: "确定",
        cancel: "取消",
        open: "打开",
        delete: "删除"
      }
    }
  }
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false
  }
});

export default i18n;
