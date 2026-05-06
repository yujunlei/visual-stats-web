# Visual Stats Lab

可视化统计建模工作台，支持 Web 和跨平台桌面端。

## Web 开发

```bash
npm install
npm run dev
```

访问 `http://127.0.0.1:5173/`。

## 桌面端开发

```bash
npm run desktop:dev
```

这个命令会同时启动 Vite dev server 和 Electron 桌面窗口。

## 桌面端打包

生成当前平台的 unpacked 应用：

```bash
npm run desktop:pack
```

生成当前平台安装包：

```bash
npm run desktop:dist
```

打包产物输出到 `release/`。macOS 会生成 `.app`、`.dmg`、`.zip`；Windows 和 Linux 需要在对应平台或 CI 环境里运行同一条 `desktop:dist`。

## 核心功能

- CSV / XLSX 导入
- 数据预览和字段类型编辑
- 缺失值处理
- 分类变量 one-hot 编码
- 插件化模型系统
- 描述统计、相关分析、线性回归
- 模型运行日志和 CSV 报告导出
