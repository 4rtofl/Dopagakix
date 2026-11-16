export declare const SKILL_NAME = "video-report";
/** パッケージに同梱しているスキル(dist/ と src/ のどちらから実行しても同じ場所を指す) */
export declare function bundledSkillDir(): string;
/** スキルの置き場所。プロジェクト単位なら <project>/.claude/skills、個人用なら ~/.claude/skills */
export declare function skillsDir(scope: {
    user: boolean;
    projectDir: string;
}): string;
export interface InstallSkillOptions {
    /** スキルを置くディレクトリ(…/.claude/skills) */
    target: string;
    /** 内容の異なる既存のスキルを上書きする */
    force?: boolean;
    /** 同梱のスキル以外を入れる場合(テスト用) */
    source?: string;
}
export interface InstallSkillResult {
    dir: string;
    status: "installed" | "updated" | "unchanged";
}
/**
 * スキルを導入する。既にあって内容が異なる場合は、利用者の編集を消さないよう --force を求める。
 * 同梱していないファイル(利用者が追加したもの)は上書き時も消さない。
 */
export declare function installSkill(options: InstallSkillOptions): Promise<InstallSkillResult>;
