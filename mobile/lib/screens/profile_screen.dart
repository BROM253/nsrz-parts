import 'package:flutter/foundation.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/providers.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/farewell.dart';
import 'support_screen.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sessionProvider).user;
    final api = ref.watch(apiProvider);
    if (user == null) return const SizedBox();
    return Scaffold(
      appBar: AppBar(title: const Text('Профиль')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Row(children: [
              CircleAvatar(
                radius: 32,
                backgroundColor: C.primarySoft,
                child: Text(user.initials, style: const TextStyle(color: C.primaryDark, fontWeight: FontWeight.w800, fontSize: 22)),
              ).animate().scale(duration: 400.ms, curve: Curves.easeOutBack),
              const SizedBox(width: 16),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(user.fullName, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
                  Text(user.companyName ?? '', style: const TextStyle(color: C.text2)),
                  Text([user.phone, user.email].whereType<String>().join(' · '), style: const TextStyle(color: C.text3, fontSize: 13)),
                ]),
              ),
            ]),
          ),
        ),
        const Padding(
          padding: EdgeInsets.fromLTRB(4, 20, 4, 10),
          child: Text('Суда компании', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
        ),
        for (final (i, v) in user.vessels.indexed)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Card(
              child: ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                leading: const CategoryIcon('deck', size: 42),
                title: Text(v.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text([v.vesselType, v.imoNumber].whereType<String>().join(' · ')),
              ),
            ).animate(delay: (60 * i).ms).fadeIn().slideX(begin: 0.08),
          ),
        const Padding(
          padding: EdgeInsets.fromLTRB(4, 6, 4, 0),
          child: Text('Чтобы добавить судно или сотрудника, напишите в отдел продаж НСРЗ.', style: TextStyle(color: C.text3, fontSize: 13)),
        ),
        const SizedBox(height: 20),
        Card(
          child: ListTile(
            leading: const Icon(Icons.support_agent_rounded, color: C.primary),
            title: const Text('Помощь и обратная связь', style: TextStyle(fontWeight: FontWeight.w700)),
            subtitle: const Text('Вопрос, ошибка, предложение · мои обращения'),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => context.push('/support'),
          ),
        ).animate().fadeIn(delay: 150.ms),
        const SizedBox(height: 12),
        if (!kIsWeb)
          Card(
            child: ListTile(
              leading: const Icon(Icons.dns_outlined, color: C.text2),
              title: const Text('Сервер'),
              subtitle: Text(api.serverUrl),
            ),
          ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: () => signOutWithFarewell(context, ref),
          icon: const Icon(Icons.logout_rounded, color: C.danger),
          label: const Text('Выйти', style: TextStyle(color: C.danger)),
          style: OutlinedButton.styleFrom(side: const BorderSide(color: C.danger)),
        ),
        const SizedBox(height: 16),
        const Center(child: Text('НСРЗ · Заказ запчастей, версия $appVersion', style: TextStyle(color: C.text3, fontSize: 12))),
      ]),
    );
  }
}
