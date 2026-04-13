using System.Diagnostics;
using System.Drawing;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace ApiBotWhatsapp.Controller;

public sealed class MainForm : Form
{
    private NotifyIcon trayIcon = null!;
    private System.Windows.Forms.Timer timer = null!;
    private Label clockLabel = null!;
    private Label statusLabel = null!;
    private Label apiStateLabel = null!;
    private Label frontendStateLabel = null!;
    private Label bridgeStateLabel = null!;
    private Label portsLabel = null!;
    private Label pidsLabel = null!;
    private TextBox logBox = null!;
    private TextBox apiPathBox = null!;
    private TextBox apiCommandBox = null!;
    private TextBox frontendPathBox = null!;
    private TextBox frontendCommandBox = null!;
    private TextBox bridgePathBox = null!;
    private TextBox bridgeCommandBox = null!;
    private Button apiStartButton = null!;
    private Button apiStopButton = null!;
    private Button frontendStartButton = null!;
    private Button frontendStopButton = null!;
    private Button bridgeStartButton = null!;
    private Button bridgeStopButton = null!;
    private Button saveConfigButton = null!;
    private Button refreshButton = null!;
    private Button hideButton = null!;
    private Button openRootButton = null!;
    private Button copyLogButton = null!;
    private Button openLogButton = null!;
    private readonly SemaphoreSlim refreshGate = new(1, 1);
    private readonly SemaphoreSlim operationGate = new(1, 1);
    private readonly object logFileLock = new();
    private readonly string rootDir;
    private readonly string apiDir;
    private readonly string frontendDir;
    private readonly string bridgeDir;
    private readonly string stateDir;
    private readonly string logsDir;
    private readonly string pidFile;
    private readonly string settingsFile;
    private readonly string logFile;
    public MainForm()
    {
        rootDir = ResolveRootDir();
        apiDir = Path.Combine(rootDir, "ApiBotWhatsapp.Api");
        frontendDir = Path.Combine(rootDir, "frontend");
        bridgeDir = Path.Combine(rootDir, "whatsapp-bridge");
        stateDir = Path.Combine(rootDir, ".dev-runner");
        logsDir = Path.Combine(stateDir, "logs");
        pidFile = Path.Combine(stateDir, "controller.json");
        settingsFile = Path.Combine(stateDir, "service-settings.json");
        logFile = Path.Combine(logsDir, $"controller-{DateTime.Now:yyyyMMdd}.log");

        Text = "Api Bot WhatsApp - Controller";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(980, 680);
        Size = new Size(1120, 760);
        BackColor = Color.FromArgb(241, 245, 249);
        Font = new Font("Segoe UI", 10f, FontStyle.Regular, GraphicsUnit.Point);
        FormBorderStyle = FormBorderStyle.Sizable;
        ShowInTaskbar = true;

        var header = BuildHeader();
        var dashboard = BuildDashboard();
        var actions = BuildActions();
        var footer = BuildFooter();

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 4,
            Padding = new Padding(18),
            BackColor = BackColor,
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 92));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 150));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 320));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        root.Controls.Add(header, 0, 0);
        root.Controls.Add(dashboard, 0, 1);
        root.Controls.Add(actions, 0, 2);
        root.Controls.Add(footer, 0, 3);

        Controls.Add(root);

        trayIcon = CreateTrayIcon();
        timer = new System.Windows.Forms.Timer { Interval = 1000 };
        timer.Tick += async (_, _) => await RefreshUiAsync();
        timer.Start();

        Load += async (_, _) =>
        {
            EnsureDirectories();
            LoadServiceSettings();
            await RefreshUiAsync();
        };

        Resize += (_, _) =>
        {
            if (WindowState == FormWindowState.Minimized)
            {
                HideToTray();
            }
        };

        FormClosing += OnFormClosing;

        Shown += (_, _) => { };
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            timer.Dispose();
            trayIcon.Visible = false;
            trayIcon.Dispose();
        }

        base.Dispose(disposing);
    }

    private Panel BuildHeader()
    {
        var panel = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.FromArgb(15, 23, 42),
            Padding = new Padding(22, 16, 22, 16),
        };

        var title = new Label
        {
            Text = "Api Bot WhatsApp",
            ForeColor = Color.White,
            Font = new Font("Segoe UI Semibold", 22f, FontStyle.Bold),
            AutoSize = true,
            Location = new Point(0, 0),
        };

        var subtitle = new Label
        {
            Text = "Programa de controle com bandeja, janela visual e inicializacao dos 3 servicos.",
            ForeColor = Color.FromArgb(191, 205, 224),
            Font = new Font("Segoe UI", 10f),
            AutoSize = true,
            Location = new Point(2, 42),
        };

        clockLabel = new Label
        {
            ForeColor = Color.FromArgb(227, 233, 242),
            Font = new Font("Consolas", 16f, FontStyle.Bold),
            AutoSize = true,
            Anchor = AnchorStyles.Top | AnchorStyles.Right,
            Location = new Point(820, 22),
        };

        panel.Controls.Add(title);
        panel.Controls.Add(subtitle);
        panel.Controls.Add(clockLabel);
        return panel;
    }

    private Control BuildDashboard()
    {
        var cardLayout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 3,
            RowCount = 1,
            BackColor = BackColor,
        };

        cardLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.33f));
        cardLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.33f));
        cardLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.34f));

        var apiCard = CreateCard("API ASP.NET", out apiStateLabel, Color.FromArgb(37, 99, 235));
        var frontendCard = CreateCard("Frontend React", out frontendStateLabel, Color.FromArgb(16, 185, 129));
        var bridgeCard = CreateCard("Bridge WhatsApp", out bridgeStateLabel, Color.FromArgb(245, 158, 11));

        cardLayout.Controls.Add(apiCard, 0, 0);
        cardLayout.Controls.Add(frontendCard, 1, 0);
        cardLayout.Controls.Add(bridgeCard, 2, 0);
        return cardLayout;
    }

    private static Panel CreateCard(string titleText, out Label valueLabel, Color accent)
    {
        var card = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.White,
            Margin = new Padding(8),
            Padding = new Padding(18),
        };

        var accentBar = new Panel
        {
            Dock = DockStyle.Left,
            Width = 8,
            BackColor = accent,
        };

        var title = new Label
        {
            Text = titleText,
            ForeColor = Color.FromArgb(71, 85, 105),
            Font = new Font("Segoe UI", 10f),
            AutoSize = true,
            Location = new Point(18, 16),
        };

        valueLabel = new Label
        {
            Text = "Parado",
            ForeColor = Color.FromArgb(15, 23, 42),
            Font = new Font("Segoe UI Semibold", 22f, FontStyle.Bold),
            AutoSize = true,
            Location = new Point(18, 44),
        };

        card.Controls.Add(valueLabel);
        card.Controls.Add(title);
        card.Controls.Add(accentBar);
        return card;
    }

    private Control BuildActions()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 2,
            Padding = new Padding(0, 8, 0, 0),
        };
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));

        var serviceGrid = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 3,
            RowCount = 1,
        };
        serviceGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.33f));
        serviceGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.33f));
        serviceGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.34f));

        serviceGrid.Controls.Add(BuildServicePanel("API", "API ASP.NET", apiDir, "dotnet run", out apiPathBox, out apiCommandBox, out apiStartButton, out apiStopButton), 0, 0);
        serviceGrid.Controls.Add(BuildServicePanel("FRONTEND", "Frontend React", frontendDir, "npm run dev", out frontendPathBox, out frontendCommandBox, out frontendStartButton, out frontendStopButton), 1, 0);
        serviceGrid.Controls.Add(BuildServicePanel("BRIDGE", "Bridge WhatsApp", bridgeDir, "npm start", out bridgePathBox, out bridgeCommandBox, out bridgeStartButton, out bridgeStopButton), 2, 0);

        var utilityRow = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            WrapContents = false,
            FlowDirection = FlowDirection.LeftToRight,
        };

        saveConfigButton = MakeButton("Salvar configuracoes", Color.FromArgb(14, 116, 144), Color.White);
        refreshButton = MakeButton("Atualizar", Color.FromArgb(100, 116, 139), Color.White);
        hideButton = MakeButton("Minimizar para bandeja", Color.FromArgb(226, 232, 240), Color.FromArgb(15, 23, 42));
        openRootButton = MakeButton("Abrir pasta", Color.FromArgb(15, 118, 110), Color.White);
        copyLogButton = MakeButton("Copiar log", Color.FromArgb(51, 65, 85), Color.White);
        openLogButton = MakeButton("Abrir log", Color.FromArgb(6, 95, 70), Color.White);

        saveConfigButton.Click += (_, _) => SaveServiceSettings();
        refreshButton.Click += async (_, _) => await RefreshUiAsync();
        hideButton.Click += (_, _) => HideToTray();
        openRootButton.Click += (_, _) => OpenFolder(rootDir);
        copyLogButton.Click += (_, _) => CopyLogsToClipboard();
        openLogButton.Click += (_, _) => OpenLogFile();

        utilityRow.Controls.Add(saveConfigButton);
        utilityRow.Controls.Add(refreshButton);
        utilityRow.Controls.Add(hideButton);
        utilityRow.Controls.Add(openRootButton);
        utilityRow.Controls.Add(copyLogButton);
        utilityRow.Controls.Add(openLogButton);

        root.Controls.Add(serviceGrid, 0, 0);
        root.Controls.Add(utilityRow, 0, 1);
        return root;
    }

    private Panel BuildServicePanel(string key, string title, string defaultPath, string defaultCommand, out TextBox pathBox, out TextBox commandBox, out Button startBtn, out Button stopBtn)
    {
        var panel = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.White,
            Margin = new Padding(8),
            Padding = new Padding(12),
        };

        var titleLabel = new Label
        {
            Text = title,
            AutoSize = true,
            Font = new Font("Segoe UI Semibold", 10f, FontStyle.Bold),
            ForeColor = Color.FromArgb(30, 41, 59),
            Location = new Point(8, 8),
        };

        var pathLabel = new Label
        {
            Text = "Pasta",
            AutoSize = true,
            Location = new Point(8, 36),
            ForeColor = Color.FromArgb(71, 85, 105),
        };

        pathBox = new TextBox
        {
            Text = defaultPath,
            Width = 255,
            Location = new Point(8, 56),
        };
        var pathField = pathBox;

        var browseBtn = new Button
        {
            Text = "...",
            Width = 34,
            Height = 28,
            Location = new Point(268, 55),
        };

        var cmdLabel = new Label
        {
            Text = "Comando",
            AutoSize = true,
            Location = new Point(8, 92),
            ForeColor = Color.FromArgb(71, 85, 105),
        };

        commandBox = new TextBox
        {
            Text = defaultCommand,
            Width = 294,
            Location = new Point(8, 112),
        };

        startBtn = MakeButton("Iniciar", Color.FromArgb(37, 99, 235), Color.White);
        startBtn.Width = 142;
        startBtn.Height = 34;
        startBtn.Location = new Point(8, 150);
        startBtn.Click += async (_, _) => await TryStartServiceAsync(key);

        stopBtn = MakeButton("Parar", Color.FromArgb(220, 38, 38), Color.White);
        stopBtn.Width = 142;
        stopBtn.Height = 34;
        stopBtn.Location = new Point(160, 150);
        stopBtn.Click += async (_, _) => await TryStopServiceAsync(key);

        browseBtn.Click += (_, _) =>
        {
            using var dialog = new FolderBrowserDialog
            {
                Description = $"Selecione a pasta do servico {title}",
                InitialDirectory = Directory.Exists(pathField.Text) ? pathField.Text : rootDir,
                UseDescriptionForTitle = true,
            };
            if (dialog.ShowDialog(this) == DialogResult.OK)
            {
                pathField.Text = dialog.SelectedPath;
            }
        };

        panel.Controls.Add(titleLabel);
        panel.Controls.Add(pathLabel);
        panel.Controls.Add(pathBox);
        panel.Controls.Add(browseBtn);
        panel.Controls.Add(cmdLabel);
        panel.Controls.Add(commandBox);
        panel.Controls.Add(startBtn);
        panel.Controls.Add(stopBtn);

        return panel;
    }

    private Control BuildFooter()
    {
        var panel = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.White,
            Padding = new Padding(18),
            Margin = new Padding(0, 12, 0, 0),
        };

        statusLabel = new Label
        {
            AutoSize = true,
            Font = new Font("Segoe UI Semibold", 15f, FontStyle.Bold),
            ForeColor = Color.FromArgb(15, 23, 42),
            Location = new Point(18, 14),
        };

        portsLabel = new Label
        {
            AutoSize = true,
            Font = new Font("Segoe UI", 10f),
            ForeColor = Color.FromArgb(71, 85, 105),
            Location = new Point(20, 50),
        };

        pidsLabel = new Label
        {
            AutoSize = true,
            Font = new Font("Segoe UI", 10f),
            ForeColor = Color.FromArgb(71, 85, 105),
            Location = new Point(20, 76),
        };

        logBox = new TextBox
        {
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            BorderStyle = BorderStyle.None,
            Dock = DockStyle.Right,
            Width = 420,
            BackColor = Color.FromArgb(248, 250, 252),
            Font = new Font("Consolas", 9f),
        };

        panel.Controls.Add(logBox);
        panel.Controls.Add(statusLabel);
        panel.Controls.Add(portsLabel);
        panel.Controls.Add(pidsLabel);
        return panel;
    }

    private static Button MakeButton(string text, Color back, Color fore)
    {
        return new Button
        {
            Text = text,
            Width = 158,
            Height = 38,
            FlatStyle = FlatStyle.Flat,
            FlatAppearance = { BorderSize = 0 },
            BackColor = back,
            ForeColor = fore,
            Font = new Font("Segoe UI Semibold", 9.8f, FontStyle.Bold),
            Margin = new Padding(0, 0, 10, 10),
        };
    }

    private NotifyIcon CreateTrayIcon()
    {
        var menu = new ContextMenuStrip();
        var openItem = new ToolStripMenuItem("Abrir painel");
        var exitItem = new ToolStripMenuItem("Sair");

        openItem.Click += (_, _) => RestoreFromTray();
        exitItem.Click += async (_, _) => await ExitApplicationAsync();

        menu.Items.Add(openItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(exitItem);

        var icon = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Visible = true,
            Text = "Api Bot WhatsApp",
            ContextMenuStrip = menu,
        };

        icon.DoubleClick += (_, _) => RestoreFromTray();
        return icon;
    }

    private void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        if (e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            HideToTray();
        }
    }

    private void HideToTray()
    {
        Hide();
        ShowInTaskbar = false;
    }

    private void RestoreFromTray()
    {
        ShowInTaskbar = true;
        Show();
        WindowState = FormWindowState.Normal;
        Activate();
        BringToFront();
    }

    private async Task ExitApplicationAsync()
    {
        await Task.Run(StopAllServices);
        trayIcon.Visible = false;
        trayIcon.Dispose();
        Close();
        Application.Exit();
    }

    private void EnsureDirectories()
    {
        if (!Directory.Exists(stateDir))
        {
            Directory.CreateDirectory(stateDir);
        }

        if (!Directory.Exists(logsDir))
        {
            Directory.CreateDirectory(logsDir);
        }
    }

    private async Task TryStartServiceAsync(string key)
    {
        if (!await operationGate.WaitAsync(0))
        {
            AppendLog("Ja existe uma operacao em andamento.");
            return;
        }

        SetServiceButtonsEnabled(key, false);
        try
        {
            SaveServiceSettings();
            AppendLog($"Iniciando servico {GetServiceName(key)}...");
            await Task.Run(() => StartService(key));
            await RefreshUiAsync();
        }
        catch (Exception ex)
        {
            SetStatusError($"Erro ao iniciar: {ex.Message}");
            AppendLog($"Erro ao iniciar {GetServiceName(key)}: {ex.Message}");
        }
        finally
        {
            SetServiceButtonsEnabled(key, true);
            operationGate.Release();
        }
    }

    private async Task TryStopServiceAsync(string key)
    {
        if (!await operationGate.WaitAsync(0))
        {
            AppendLog("Ja existe uma operacao em andamento.");
            return;
        }

        SetServiceButtonsEnabled(key, false);
        try
        {
            AppendLog($"Parando servico {GetServiceName(key)}...");
            await Task.Run(() => StopService(key));
            await RefreshUiAsync();
        }
        catch (Exception ex)
        {
            SetStatusError($"Erro ao parar: {ex.Message}");
            AppendLog($"Erro ao parar: {ex.Message}");
        }
        finally
        {
            SetServiceButtonsEnabled(key, true);
            operationGate.Release();
        }
    }

    private void StartService(string key)
    {
        var pidKey = GetPidKey(key);
        var state = GetPidState();
        if (state.TryGetValue(pidKey, out var existing) && existing is int pid && pid > 0 && ProcessExists(pid))
        {
            throw new InvalidOperationException($"{GetServiceName(key)} ja esta em execucao.");
        }

        var workingDirectory = GetPathBox(key).Text.Trim();
        var command = GetCommandBox(key).Text.Trim();
        if (string.IsNullOrWhiteSpace(workingDirectory))
        {
            throw new InvalidOperationException($"Informe a pasta do servico {GetServiceName(key)}.");
        }

        if (string.IsNullOrWhiteSpace(command))
        {
            throw new InvalidOperationException($"Informe o comando do servico {GetServiceName(key)}.");
        }

        EnsureDirectories();

        try
        {
            var process = StartProcess(GetServiceName(key), "cmd.exe", $"/d /s /c \"{command}\"", workingDirectory);
            state[pidKey] = process.Id;
            state[$"{key}_STARTED_AT"] = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
            File.WriteAllText(pidFile, JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true }));
            AppendLog($"{GetServiceName(key)} iniciado com sucesso.");
        }
        catch (Exception)
        {
            RemovePidState(key);
            throw;
        }
    }

    private void StopService(string key)
    {
        var state = GetPidState();
        var pidKey = GetPidKey(key);
        if (state.TryGetValue(pidKey, out var value) && value is int pid && pid > 0)
        {
            TryKillProcess(pid);
        }

        var port = GetPort(key);
        if (port > 0)
        {
            StopByPort(port);
        }

        RemovePidState(key);
        AppendLog($"{GetServiceName(key)} parado.");
    }

    private void StopAllServices()
    {
        foreach (var key in new[] { "API", "FRONTEND", "BRIDGE" })
        {
            StopService(key);
        }
    }

    private void RemovePidState(string key)
    {
        var state = GetPidState();
        state.Remove(GetPidKey(key));
        state.Remove($"{key}_STARTED_AT");

        if (state.Count == 0)
        {
            if (File.Exists(pidFile))
            {
                File.Delete(pidFile);
            }
            return;
        }

        File.WriteAllText(pidFile, JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true }));
    }

    private string GetServiceName(string key)
    {
        return key switch
        {
            "API" => "API",
            "FRONTEND" => "Frontend",
            "BRIDGE" => "Bridge",
            _ => key,
        };
    }

    private string GetPidKey(string key)
    {
        return key switch
        {
            "API" => "API_PID",
            "FRONTEND" => "FRONTEND_PID",
            "BRIDGE" => "BRIDGE_PID",
            _ => throw new InvalidOperationException("Chave de servico invalida."),
        };
    }

    private int GetPort(string key)
    {
        return key switch
        {
            "API" => 5207,
            "FRONTEND" => 5173,
            "BRIDGE" => 3001,
            _ => 0,
        };
    }

    private TextBox GetPathBox(string key)
    {
        return key switch
        {
            "API" => apiPathBox,
            "FRONTEND" => frontendPathBox,
            "BRIDGE" => bridgePathBox,
            _ => throw new InvalidOperationException("Chave de servico invalida."),
        };
    }

    private TextBox GetCommandBox(string key)
    {
        return key switch
        {
            "API" => apiCommandBox,
            "FRONTEND" => frontendCommandBox,
            "BRIDGE" => bridgeCommandBox,
            _ => throw new InvalidOperationException("Chave de servico invalida."),
        };
    }

    private void SetServiceButtonsEnabled(string key, bool enabled)
    {
        switch (key)
        {
            case "API":
                apiStartButton.Enabled = enabled;
                apiStopButton.Enabled = enabled;
                break;
            case "FRONTEND":
                frontendStartButton.Enabled = enabled;
                frontendStopButton.Enabled = enabled;
                break;
            case "BRIDGE":
                bridgeStartButton.Enabled = enabled;
                bridgeStopButton.Enabled = enabled;
                break;
        }
    }

    private void LoadServiceSettings()
    {
        apiPathBox.Text = apiDir;
        apiCommandBox.Text = "dotnet run";
        frontendPathBox.Text = frontendDir;
        frontendCommandBox.Text = "npm run dev";
        bridgePathBox.Text = bridgeDir;
        bridgeCommandBox.Text = "npm start";

        try
        {
            if (!File.Exists(settingsFile))
            {
                return;
            }

            var json = File.ReadAllText(settingsFile);
            if (string.IsNullOrWhiteSpace(json))
            {
                return;
            }

            using var doc = JsonDocument.Parse(json);
            SetServiceFromConfig(doc.RootElement, "API", apiPathBox, apiCommandBox);
            SetServiceFromConfig(doc.RootElement, "FRONTEND", frontendPathBox, frontendCommandBox);
            SetServiceFromConfig(doc.RootElement, "BRIDGE", bridgePathBox, bridgeCommandBox);
        }
        catch (Exception ex)
        {
            AppendLog($"Falha ao carregar configuracoes: {ex.Message}");
        }
    }

    private void SaveServiceSettings()
    {
        try
        {
            EnsureDirectories();
            var payload = new Dictionary<string, Dictionary<string, string>>
            {
                ["API"] = new Dictionary<string, string>
                {
                    ["Path"] = apiPathBox.Text.Trim(),
                    ["Command"] = apiCommandBox.Text.Trim(),
                },
                ["FRONTEND"] = new Dictionary<string, string>
                {
                    ["Path"] = frontendPathBox.Text.Trim(),
                    ["Command"] = frontendCommandBox.Text.Trim(),
                },
                ["BRIDGE"] = new Dictionary<string, string>
                {
                    ["Path"] = bridgePathBox.Text.Trim(),
                    ["Command"] = bridgeCommandBox.Text.Trim(),
                },
            };

            File.WriteAllText(settingsFile, JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = true }));
            AppendLog("Configuracoes salvas.");
        }
        catch (Exception ex)
        {
            SetStatusError($"Erro ao salvar configuracoes: {ex.Message}");
        }
    }

    private static void SetServiceFromConfig(JsonElement root, string key, TextBox pathBox, TextBox commandBox)
    {
        if (!root.TryGetProperty(key, out var node))
        {
            return;
        }

        if (node.TryGetProperty("Path", out var pathNode) && pathNode.ValueKind == JsonValueKind.String)
        {
            pathBox.Text = pathNode.GetString() ?? pathBox.Text;
        }

        if (node.TryGetProperty("Command", out var commandNode) && commandNode.ValueKind == JsonValueKind.String)
        {
            commandBox.Text = commandNode.GetString() ?? commandBox.Text;
        }
    }

    private Process StartProcess(string serviceName, string fileName, string arguments, string workingDirectory)
    {
        if (!Directory.Exists(workingDirectory))
        {
            throw new DirectoryNotFoundException($"Pasta do {serviceName} nao encontrada: {workingDirectory}");
        }

        var info = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };

        Process? process;
        try
        {
            process = Process.Start(info);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"Falha ao iniciar {serviceName}. Comando: {fileName} {arguments}. Pasta: {workingDirectory}. Detalhe: {ex.Message}", ex);
        }

        if (process is null)
        {
            throw new InvalidOperationException($"Nao foi possivel iniciar {serviceName}. Verifique se o comando {fileName} existe.");
        }

        process.OutputDataReceived += (_, e) =>
        {
            if (!string.IsNullOrWhiteSpace(e.Data))
            {
                AppendLog($"[{serviceName}] {e.Data}");
            }
        };
        process.ErrorDataReceived += (_, e) =>
        {
            if (!string.IsNullOrWhiteSpace(e.Data))
            {
                AppendLog($"[{serviceName}][erro] {e.Data}");
            }
        };
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        if (process.WaitForExit(1200))
        {
            throw new InvalidOperationException($"{serviceName} encerrou imediatamente ao iniciar (codigo {process.ExitCode}). Veja os logs para mais detalhes.");
        }

        return process;
    }

    private static void TryKillProcess(int pid)
    {
        try
        {
            var process = Process.GetProcessById(pid);
            process.Kill(entireProcessTree: true);
            process.WaitForExit(3000);
        }
        catch
        {
            // Ignora process already exited.
        }
    }

    private void StopByPort(int port)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "powershell",
                Arguments = $"-NoProfile -Command \"$ids = Get-NetTCPConnection -LocalPort {port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach($id in $ids) {{ Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }}\"",
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            using var p = Process.Start(psi);
            p?.WaitForExit(4000);
        }
        catch
        {
            // Best effort only.
        }
    }

    private Dictionary<string, object> GetPidState()
    {
        try
        {
            if (!File.Exists(pidFile))
            {
                return new Dictionary<string, object>();
            }

            var json = File.ReadAllText(pidFile);
            if (string.IsNullOrWhiteSpace(json))
            {
                return new Dictionary<string, object>();
            }

            using var doc = JsonDocument.Parse(json);
            var result = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                if (prop.Value.ValueKind == JsonValueKind.Number && prop.Value.TryGetInt32(out var number))
                {
                    result[prop.Name] = number;
                }
                else if (prop.Value.ValueKind == JsonValueKind.String)
                {
                    result[prop.Name] = prop.Value.GetString() ?? string.Empty;
                }
            }

            return result;
        }
        catch
        {
            return new Dictionary<string, object>();
        }
    }

    private StackStatus GetStackStatus()
    {
        var state = GetPidState();
        var runningCount = 0;

        foreach (var key in new[] { "API_PID", "FRONTEND_PID", "BRIDGE_PID" })
        {
            if (state.TryGetValue(key, out var value) && value is int pid && pid > 0)
            {
                if (!ProcessExists(pid))
                {
                    continue;
                }

                runningCount++;
            }
        }

        var ports = string.Join(" | ", new[] { 5207, 5173, 3001 }.Select(port => $"{port}:{(IsPortOpen(port) ? "ON" : "OFF")}"));
        var startedAt = new[] { "API_STARTED_AT", "FRONTEND_STARTED_AT", "BRIDGE_STARTED_AT" }
            .Where(k => state.TryGetValue(k, out _))
            .Select(k => state[k]?.ToString() ?? string.Empty)
            .FirstOrDefault(v => !string.IsNullOrWhiteSpace(v)) ?? string.Empty;
        return new StackStatus(runningCount, runningCount > 0, ports, startedAt);
    }

    private static bool ProcessExists(int pid)
    {
        try
        {
            _ = Process.GetProcessById(pid);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool IsPortOpen(int port)
    {
        try
        {
            using var client = new System.Net.Sockets.TcpClient();
            var task = client.ConnectAsync("127.0.0.1", port);
            return task.Wait(400);
        }
        catch
        {
            return false;
        }
    }

    private async Task RefreshUiAsync()
    {
        if (!await refreshGate.WaitAsync(0))
        {
            return;
        }

        try
        {
            var stack = await Task.Run(GetStackStatus);
            RefreshUi(stack);
        }
        finally
        {
            refreshGate.Release();
        }
    }

    private void RefreshUi(StackStatus stack)
    {
        var now = DateTime.Now;
        var running = stack.IsRunning;
        var state = GetPidState();
        var apiText = BuildServiceCardStatus("API_PID", "API_STARTED_AT", "Ativa", "Parada", 5207, state, now);
        var frontendText = BuildServiceCardStatus("FRONTEND_PID", "FRONTEND_STARTED_AT", "Ativo", "Parado", 5173, state, now);
        var bridgeText = BuildServiceCardStatus("BRIDGE_PID", "BRIDGE_STARTED_AT", "Ativa", "Parada", 3001, state, now);
        var apiUptime = GetUptimeText("API_STARTED_AT", state, now);
        var frontendUptime = GetUptimeText("FRONTEND_STARTED_AT", state, now);
        var bridgeUptime = GetUptimeText("BRIDGE_STARTED_AT", state, now);

        clockLabel.Text = now.ToString("HH:mm:ss");
        notifyIconText(now, stack);
        statusLabel.Text = running ? "Sistema em execucao" : "Pronto para iniciar";
        statusLabel.ForeColor = Color.FromArgb(15, 23, 42);
        portsLabel.Text = $"Portas: {stack.Ports}";
        pidsLabel.Text = $"Tempo ativo (hh:mm:ss) API {apiUptime} | Frontend {frontendUptime} | Bridge {bridgeUptime}";
        apiStateLabel.Text = apiText;
        frontendStateLabel.Text = frontendText;
        bridgeStateLabel.Text = bridgeText;
    }

    private void SetStatusError(string message)
    {
        if (IsDisposed)
        {
            return;
        }

        if (InvokeRequired)
        {
            BeginInvoke(new Action(() => SetStatusError(message)));
            return;
        }

        statusLabel.Text = message;
        statusLabel.ForeColor = Color.FromArgb(185, 28, 28);
    }

    private string BuildServiceCardStatus(string pidKey, string startedAtKey, string runningText, string stoppedText, int port, Dictionary<string, object> state, DateTime now)
    {
        var isRunning = state.TryGetValue(pidKey, out var value) && value is int pid && pid > 0 && ProcessExists(pid);
        if (!isRunning)
        {
            return $"{stoppedText}\r\nPorta {port}: OFF\r\nTempo ativo: -";
        }

        var uptime = GetUptimeText(startedAtKey, state, now);
        var portState = IsPortOpen(port) ? "ON" : "OFF";
        return $"{runningText}\r\nPorta {port}: {portState}\r\nTempo ativo: {uptime}";
    }

    private static string GetUptimeText(string startedAtKey, Dictionary<string, object> state, DateTime now)
    {
        if (!state.TryGetValue(startedAtKey, out var value))
        {
            return "-";
        }

        var text = value?.ToString();
        if (string.IsNullOrWhiteSpace(text))
        {
            return "-";
        }

        if (!DateTime.TryParse(text, out var startedAt))
        {
            return "-";
        }

        var delta = now - startedAt;
        if (delta < TimeSpan.Zero)
        {
            delta = TimeSpan.Zero;
        }

        return $"{(int)delta.TotalHours:00}:{delta.Minutes:00}:{delta.Seconds:00}";
    }

    private void notifyIconText(DateTime now, StackStatus stack)
    {
        trayIcon.Text = $"ApiBot {(stack.IsRunning ? "Rodando" : "Parado")} {now:HH:mm:ss}";
    }

    private static void OpenFolder(string path)
    {
        if (!Directory.Exists(path))
        {
            return;
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = path,
            UseShellExecute = true
        });
    }

    private void OpenLogFile()
    {
        try
        {
            EnsureDirectories();
            if (!File.Exists(logFile))
            {
                File.AppendAllText(logFile, string.Empty);
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = "notepad.exe",
                Arguments = $"\"{logFile}\"",
                UseShellExecute = true,
            });
        }
        catch (Exception ex)
        {
            SetStatusError($"Erro ao abrir log: {ex.Message}");
        }
    }

    private void CopyLogsToClipboard()
    {
        try
        {
            var content = logBox.Text;
            if (string.IsNullOrWhiteSpace(content) && File.Exists(logFile))
            {
                content = File.ReadAllText(logFile);
            }

            if (string.IsNullOrWhiteSpace(content))
            {
                content = "Sem logs ate o momento.";
            }

            Clipboard.SetText(content);
            AppendLog("Log copiado para area de transferencia.");
        }
        catch (Exception ex)
        {
            SetStatusError($"Erro ao copiar log: {ex.Message}");
        }
    }

    private void AppendLog(string message)
    {
        if (IsDisposed || logBox.IsDisposed)
        {
            return;
        }

        if (InvokeRequired)
        {
            BeginInvoke(new Action(() => AppendLog(message)));
            return;
        }

        EnsureDirectories();
        var line = $"[{DateTime.Now:HH:mm:ss}] {message}";
        logBox.AppendText($"{line}{Environment.NewLine}");
        lock (logFileLock)
        {
            File.AppendAllText(logFile, line + Environment.NewLine);
        }
    }

    private static string ResolveRootDir()
    {
        foreach (var start in new[] { AppContext.BaseDirectory, Directory.GetCurrentDirectory() })
        {
            var dir = new DirectoryInfo(start);
            while (dir is not null)
            {
                if (Directory.Exists(Path.Combine(dir.FullName, "ApiBotWhatsapp.Api"))
                    && Directory.Exists(Path.Combine(dir.FullName, "frontend"))
                    && Directory.Exists(Path.Combine(dir.FullName, "whatsapp-bridge")))
                {
                    return dir.FullName;
                }

                dir = dir.Parent;
            }
        }

        throw new InvalidOperationException("Nao foi possivel localizar a pasta raiz do projeto. Execute o controller dentro da estrutura do repositorio.");
    }

    private sealed record StackStatus(int RunningCount, bool IsRunning, string Ports, string StartedAt);
}
