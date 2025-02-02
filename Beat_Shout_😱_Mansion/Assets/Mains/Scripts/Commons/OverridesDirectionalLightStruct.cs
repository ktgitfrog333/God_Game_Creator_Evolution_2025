using UnityEngine;

namespace Mains.Commons
{
    /// <summary>
    /// Directional Lightをオーバーライドする構造体
    /// </summary>
    [System.Serializable]
    public struct OverridesDirectionalLightStruct
    {
        // 設定値
        public float intensity;
        public float shadowStrength;
        public Color lightColor;
        [Tooltip("オンで毎フレーム実行／オフで一度のみ")]
        public bool Updateされる度に更新;
    }
}
