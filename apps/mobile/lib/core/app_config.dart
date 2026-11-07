/// Build-time configuration, passed with `--dart-define-from-file=config/<env>.json`.
enum AppEnvironment { dev, staging, prod }

class AppConfig {
  const AppConfig({required this.environment, required this.apiBaseUrl});

  factory AppConfig.fromEnvironment() {
    const env = String.fromEnvironment('APP_ENV', defaultValue: 'dev');
    const apiBaseUrl = String.fromEnvironment(
      'API_BASE_URL',
      // Android emulator alias for the host machine's localhost.
      defaultValue: 'http://10.0.2.2:3000',
    );
    return AppConfig(
      environment: AppEnvironment.values.firstWhere(
        (e) => e.name == env,
        orElse: () => AppEnvironment.dev,
      ),
      apiBaseUrl: apiBaseUrl,
    );
  }

  final AppEnvironment environment;
  final String apiBaseUrl;

  bool get isProduction => environment == AppEnvironment.prod;
}
